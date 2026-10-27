import { describe, it } from 'vitest';
import { UPLCDecoder } from '@harmoniclabs/uplc';
import { DataConstr, DataB, DataI, DataList, DataMap } from '@harmoniclabs/plutus-data';
import { Application, UPLCConst } from '@harmoniclabs/uplc';
import { Machine } from '@harmoniclabs/plutus-machine';
import { defaultV3Costs } from '@harmoniclabs/cardano-costmodels-ts';
import { CEKError } from '@harmoniclabs/plutus-machine';

const SCRIPT_BYTES = Buffer.from('59015201010029800aba2aba1aab9faab9eaab9dab9a488888966002664464653001300637540032259800980298041baa002899192cc004c03800a0071640306eb8c030004c024dd50014590074c024012601200491112cc004cdc3a4004009132332233006004159800980518069baa0018acc004cdc79bae3010300e375400891011248656c6c6f5370656e6452656465656d657200899199119801001000912cc00400629422b30013371e6eb8c04c00400e2946266004004602800280790121bac301130123012301230123012301230123012300f375400c6eb8c040c038dd5180818071baa0018a504031164030601c002601c601e00260166ea80162b3001300700489919802001099b8f375c601c60186ea800922011148656c6c6f4d696e7452656465656d657200375c601a60166ea80162c80490090c020c024004c020008c00cdd50039b874800229344d95900101', 'hex');

const OWNER_PKH = 'dd'.repeat(28);

function termToStr(node: any, depth = 0, max = 15): string {
  if (node == null) return 'null';
  if (depth > max) return '...';
  const tag = node.tag;
  if (tag === 0) return `Var(${node.deBruijn})`;
  if (tag === 1) return `Delay(${termToStr(node.delayedTerm, depth + 1, max)})`;
  if (tag === 2) return `Lam(${termToStr(node.body, depth + 1, max)})`;
  if (tag === 3) return `(${termToStr(node.func, depth + 1, max)} ${termToStr(node.arg, depth + 1, max)})`;
  if (tag === 4) {
    const v = node.value;
    if (typeof v === 'bigint') return `${v}`;
    if (v instanceof Uint8Array) return `BS(${Buffer.from(v).toString('hex').slice(0,10)})`;
    return `Const`;
  }
  if (tag === 5) return `!(${termToStr(node.forced, depth + 1, max)})`;
  if (tag === 6) return `ERR`;
  if (tag === 7) {
    const b: Record<number, string> = {7:'eqI',15:'eqBS',26:'iTE',29:'fstP',30:'sndP',31:'chList',33:'hd',34:'tl',42:'uCons',44:'uBD',45:'uID',38:'uList',14:'consByteStr',16:'ltBS',17:'lteBS'};
    return `${b[node.builtinTag] ?? `B${node.builtinTag}`}`;
  }
  if (tag === 8) {
    if (depth > max - 3) return `Constr(${node.index},[...])`;
    return `Constr(${node.index},[${node.terms?.map((t: any) => termToStr(t, depth + 1, max)).join(',')}])`;
  }
  if (tag === 9) {
    if (depth > max - 3) return `Case(...)`;
    const branches = node.continuations?.map((b: any, i: number) => `B${i}=${termToStr(b, depth + 1, max)}`).join(',');
    return `Case(${termToStr(node.constrTerm, depth + 1, max)},{${branches}})`;
  }
  return `?(${tag})`;
}

// Find the deep dispatch Case that checks scriptInfo constructor index
function findDeepDispatchCase(program: any) {
  const outerCase = program.body.body;        // Lambda.body = outer Case
  const b0 = outerCase.continuations[0];      // 6-lambda branch
  let curr = b0;
  while (curr?.constructor?.name === 'Lambda') curr = curr.body;
  const firstForce = curr;                    // Force(...)
  const firstCase = firstForce?.forced;       // Case(Constr(0,[G0,G1,G2]), ...)

  // G0 = firstCase.constrTerm.terms[0]
  const G0 = firstCase?.constrTerm?.terms?.[0];
  // G0 = App(App(Lam(Lam(body_with_lambdas)), arg1), arg2)
  // Navigate into the Lam bodies to find the deep Case
  const lam1 = G0?.func?.func;               // outer Lam (ctx_fields)
  const lam2 = lam1?.body;                   // inner Lam (eqInt0)
  const body = lam2?.body;                   // App(Lam(rest1), tailList(ctx_fields))
  const lam3 = body?.func;                   // Lam(rest1)
  const body2 = lam3?.body;                  // App(Lam(scriptInfo), headList(tailList(rest1)))
  const lam4 = body2?.func;                  // Lam(scriptInfo_local)
  const deepCase = lam4?.body;               // The deep dispatch Case

  // The deep dispatch Case's branch 0 is: Lam(Lam(Lam(Lam(Force(Case(...))))))
  // Navigate into its branch 0 body
  const b0deep = deepCase?.continuations?.[0];  // 4-lambda branch
  let curr2 = b0deep;
  while (curr2?.constructor?.name === 'Lambda') curr2 = curr2.body;
  const innerForce = curr2;                  // Force(Case(Constr(0,[C0,C1,C2]), ...))
  const innerCase = innerForce?.forced;      // Case(...)

  return { deepCase, innerCase };
}

describe('decode innermost dispatch', () => {
  it('print deepCase and innerCase', () => {
    const program = UPLCDecoder.parse(SCRIPT_BYTES, 'cbor');
    const { deepCase, innerCase } = findDeepDispatchCase(program);

    console.log('=== deepCase (checks scriptInfo constructor) ===');
    if (deepCase?.tag === 9) {
      console.log('scrutinee fields count:', deepCase.constrTerm?.terms?.length);
      deepCase.constrTerm?.terms?.forEach((t: any, i: number) => {
        console.log(`  field ${i}:`, termToStr(t, 0, 8));
      });
      console.log('branches count:', deepCase.continuations?.length);
    }

    console.log('\n=== innerCase (the mint-vs-spend dispatch) ===');
    if (innerCase?.tag === 9) {
      console.log('scrutinee:', termToStr(innerCase.constrTerm, 0, 10));
      console.log('branches count:', innerCase.continuations?.length);
      innerCase.continuations?.forEach((b: any, i: number) => {
        console.log(`branch ${i}:`, termToStr(b, 0, 10));
      });
      // Print each field of the Constr
      innerCase.constrTerm?.terms?.forEach((t: any, i: number) => {
        console.log(`  constrTerm field ${i}:`, termToStr(t, 0, 12));
      });
    }
  });

  it('decode the C2 (false branch = spend handler) of innerCase', () => {
    const program = UPLCDecoder.parse(SCRIPT_BYTES, 'cbor');
    const { innerCase } = findDeepDispatchCase(program);

    // C2 is the 3rd field (index 2) of innerCase.constrTerm
    const C2 = innerCase?.constrTerm?.terms?.[2];
    console.log('C2 (false/spend branch):', termToStr(C2, 0, 20));
  });
});
