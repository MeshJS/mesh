import {
  Address, bool, compile, int, makeValidator, 
  PCurrencySymbol, perror, pfn, phoist, pInt,
  pisEmpty, plam, plet, pmatch, PPubKeyHash,
  PScriptContext, pstruct, PTokenName, ptraceIfFalse,
  PTxInInfo, punConstrData, Script,
} from "@harmoniclabs/plu-ts";
import { PlutusScript } from "@meshsdk/core";

const NFTSale = pstruct({
  NFTSale: {
    seller: PPubKeyHash.type,
    price: int,
    policy: PCurrencySymbol.type,
    tokenName: PTokenName.type
  }
});

const SaleAction = pstruct({
  Buy: {},
  Close: {}
});

const feeDenominator = phoist(pInt(1_000_000))

const contract = pfn([
  PPubKeyHash.type, // owner
  int, // feeNumerator
  NFTSale.type,
  SaleAction.type,
  PScriptContext.type
], bool)
  ((
    owner, feeNumerator,
    datum, action, ctx
  ) =>
    ctx.extract("txInfo").in(({ txInfo }) =>
      datum.extract("seller", "price", "policy", "tokenName").in(sale =>

        plet(
          plam(PTxInInfo.type, bool)
            (_in => _in.extract("resolved").in(({ resolved }) =>
              resolved.extract("address").in(({ address }) =>
                punConstrData.$(address as any).fst.eq(0) // MUST be the first constructor (PPubKeyHash) 
              ))
            )
        ).in(_ =>

          txInfo.extract("signatories", "outputs", "inputs").in(tx => {

            const nftSentToSigner = tx.outputs.some(_out =>
              _out.extract("value", "address").in(out => {

                const outToBuyer = plet(
                  tx.signatories.head
                ).in(buyer =>
                  out.address.extract("credential").in(({ credential }) =>

                    pmatch(credential)
                      .onPPubKeyCredential(_ => _.extract("pkh").in(({ pkh }) => pkh.eq(buyer)))
                      ._(_ => perror(bool))

                  )
                );

                const valueIncludesNFT = out.value.some(entry =>
                  entry.fst.eq(sale.policy)
                    .and(
                      plet(entry.snd).in(assets =>
                        assets.some(assetEntry =>
                          assetEntry.fst.eq(sale.tokenName)
                            .and(
                              assetEntry.snd.eq(1)
                            )
                        )
                      )
                    )
                )

                return ptraceIfFalse.$("multiple signatories").$(pisEmpty.$(tx.signatories.tail))
                  .and(ptraceIfFalse.$("outToBuyer").$(outToBuyer))
                  .and(ptraceIfFalse.$("valueIncludesNFT").$(valueIncludesNFT));
              })
            );

            const paidToSeller = tx.outputs.some(_out =>
              _out.extract("value", "address").in(out => {

                const outValueGtEqPrice = out.value.some(entry =>
                  entry.fst.eq("")
                    .and(
                      entry.snd // assets
                        .head // first asset (only on in ADA entry)
                        .snd  // quantity
                        .gtEq(sale.price)
                    )
                );

                const outToSeller = out.address.extract("credential").in(({ credential }) =>
                  pmatch(credential)
                    .onPPubKeyCredential(_ => _.extract("pkh").in(({ pkh }) => pkh.eq(sale.seller)))
                    ._(_ => perror(bool))
                );

                return ptraceIfFalse.$("outValueGtEqPrice").$(outValueGtEqPrice)
                    .and(ptraceIfFalse.$("outToSeller").$(outToSeller));
              })
            );

            // const noInputScript = plam(list(PTxInInfo.type), bool)
            //   (inputs =>
            //     inputs.every(isInputFromPubKeyHash)
            //   )

            // prvent double spending attck
            // const onlyScriptInputIsOwn = precursiveList(bool, PTxInInfo.type)
            //   .$(_self => pdelay(pBool(false))) // caseNil
            //   .$(
            //     pfn([
            //       fn([list(PTxInInfo.type)], bool),
            //       PTxInInfo.type,
            //       list(PTxInInfo.type)
            //     ], bool)
            //       ((self, head, tail) =>
            //         pif(bool).$(isInputFromPubKeyHash.$(head))
            //           .then(self.$(tail) as any)
            //           .else(
            //             /*
            //               we could add a check for the input to be from this actual script
 
            //               however since we are validating for the inputs to contain a single script input
            //               it implies that it has to be this one (since the validator is runnig)
            //             */
            //             noInputScript.$(tail)
            //           )
            //       )
            //   )
            //   .$(tx.inputs);

            const paidFee = tx.outputs.some(_out =>
              _out.extract("address", "value").in(out => {

                const goingToMarketplaceOwner =
                  out.address.extract("credential").in(({ credential: ownerCreds }) =>
                    pmatch(ownerCreds)
                      .onPPubKeyCredential(_ => _.extract("pkh").in(({ pkh }) => pkh.eq(owner)))
                      ._(_ => perror(bool))
                  );

                const _paidFee = out.value.some(entry =>
                  entry.fst.eq("")
                    .and(
                      entry.snd.head.snd.gtEq(
                        sale.price.mult(feeNumerator).div(feeDenominator)
                      )
                    )
                )

                return goingToMarketplaceOwner.and(_paidFee);
              })
            );

            return pmatch(action)
              .onBuy(_ =>
                  ptraceIfFalse.$("nftSentToSigner").$( nftSentToSigner )
                  .and(ptraceIfFalse.$("paidToSeller").$(paidToSeller))
                  // .and(ptraceIfFalse.$("onlyScriptInputIsOwn").$(onlyScriptInputIsOwn))
                  .and(ptraceIfFalse.$("paidFee").$(paidFee))
              )
              .onClose(_ => tx.signatories.some(sale.seller.eqTerm))

          }))))

  );

/** 
 * > **NOTE** The fee numerator is in the order of millions
 * > for example `3000` implies a fee of `3000/1_000_000` (or `0.003`)
 * > which in a scale from `0` to `1` implies a fee of `0.3%`
 */
const compileMarketplace = (owner: OwnerAddress, percentage: number) => {
  const appliedContract = contract
    .$(
        PPubKeyHash.from(
            Address.fromString( owner ).paymentCreds.hash.toBuffer()
        )
    )
    .$(
      pInt(percentage)
    );

  const untypedValidator = makeValidator(appliedContract);
  return compile(untypedValidator);
};

export const buildPlutusScript = (owner: OwnerAddress, percentage: number): PlutusScript => ({
  version: 'V2' as const,
  code: new Script(
    "PlutusScriptV2" as any,
    compileMarketplace(owner, percentage),
  ).cbor.toString()
});

export type OwnerAddress = string;
