import { pstruct, pfn, PCurrencySymbol, PScriptContext, PTokenName, bool, int, pBool, PPubKeyHash, pisEmpty, plet, pmatch, perror, plam, PTxInInfo, list, punConstrData, precursiveList, fn, pif, pdelay, phoist, pInt } from "@harmoniclabs/plu-ts";

const NFTSale = pstruct({
    NFTSale: {
        seller: PPubKeyHash.type,
        price:  int,
        policy: PCurrencySymbol.type,
        tokenName: PTokenName.type
    }
});

const SaleAction = pstruct({
    Buy: {},
    Close: {}
});

const feeDenominator = phoist( pInt( 1_000_000 ) )

const contract = pfn([
    PPubKeyHash.type, // owner
    int, // feeNumerator
    NFTSale.type,
    SaleAction.type,
    PScriptContext.type
],  bool)
(( 
    owner, feeNumerator,
    datum, action, ctx
) =>
    ctx.extract("txInfo").in( ({ txInfo }) => 
    datum.extract("seller","price","policy","tokenName").in( sale =>

    plet(
        plam( PTxInInfo.type, bool )
        ( _in => _in.extract("resolved").in( ({ resolved }) =>
            resolved.extract("address").in( ({ address }) =>
                punConstrData.$( address as any ).fst.eq( 0 ) // MUST be the first constructor (PPubKeyHash) 
            ))
        )
    ).in( isInputFromPubKeyHash =>

    txInfo.extract("signatories","outputs","inputs").in( tx => {

        const nftSentToSigner = tx.outputs.some( _out => 
            _out.extract("value","address").in( out => {

                const outToBuyer = plet(
                    tx.signatories.head
                ).in( buyer => 
                    out.address.extract("credential").in( ({ credential }) =>
                    
                        pmatch( credential )
                        .onPPubKeyCredential( _ => _.extract("pkh").in( ({ pkh }) => pkh.eq( buyer )) )
                        ._( _ => perror( bool ) )

                    )
                );

                const valueIncludesNFT = out.value.some( entry =>
                    entry.fst.eq( sale.policy )
                    .and(
                        plet( entry.snd ).in( assets => 
                            assets.some( assetEntry =>
                                assetEntry.fst.eq( sale.tokenName )
                                .and(
                                    assetEntry.snd.eq( 1 )
                                ) 
                            )
                        )
                    )
                )

                return pisEmpty.$( tx.signatories.tail )
                .and(  outToBuyer )
                .and(  valueIncludesNFT );
            })
        );

        const paidToSeller = tx.outputs.some( _out =>
            _out.extract("value","address").in( out => {

                const outValueGtEqPrice = out.value.some( entry =>
                    entry.fst.eq("")
                    .and(
                        entry.snd // assets
                        .head // first asset (only on in ADA entry)
                        .snd  // quantity
                        .gtEq( sale.price )
                    ) 
                );

                const outToSeller = out.address.extract("credential").in( ({ credential }) =>
                    pmatch( credential )
                    .onPPubKeyCredential( _ => _.extract("pkh").in( ({ pkh }) => pkh.eq( sale.seller ) ))
                    ._( _ => perror( bool ))
                );

                return outValueGtEqPrice.and( outToSeller );
            })
        );
        
        const noInputScript = plam( list( PTxInInfo.type ), bool )
        ( inputs =>
            inputs.every( isInputFromPubKeyHash )
        )

        // prvent double spending attck
        const onlyScriptInputIsOwn = precursiveList( bool, PTxInInfo.type )
            .$( _self => pdelay( pBool( false ) ) ) // caseNil
            .$(
                pfn([
                    fn([ list( PTxInInfo.type ) ], bool ),
                    PTxInInfo.type,
                    list( PTxInInfo.type )
                ],  bool)
                (( self, head, tail ) => 
                    pif( bool ).$( isInputFromPubKeyHash.$( head ) )
                    .then( self.$( tail ) as any )
                    .else(
                        /*
                          we could add a check for the input to be from this actual script

                          however since we are validating for the inputs to contain a single script input
                          it implies that it has to be this one (since the validator is runnig)
                        */
                        noInputScript.$( tail )
                    )
                )
            )
            .$( tx.inputs );

        const paidFee = tx.outputs.some( _out => 
            _out.extract("address","value").in( out => {

                const goingToMarketplaceOwner = 
                out.address.extract("credential").in( ({ credential: ownerCreds }) =>
                    pmatch( ownerCreds )
                    .onPPubKeyCredential( _ => _.extract("pkh").in( ({ pkh }) => pkh.eq( owner ) ))
                    ._( _ => perror( bool ) )
                );

                const _paidFee = out.value.some( entry => 
                    entry.fst.eq("")
                    .and(
                        entry.snd.head.snd.gtEq(
                            sale.price.mult( feeNumerator ).div( feeDenominator )
                        )
                    )
                )

                return goingToMarketplaceOwner.and( _paidFee );
            })
        );

        return pmatch( action )
        .onBuy( _ =>
            nftSentToSigner
            .and( paidToSeller )
            .and( onlyScriptInputIsOwn )
            .and( paidFee )
        )
        .onClose( _ => tx.signatories.some( sale.seller.eqTerm ) )

    }))))
)