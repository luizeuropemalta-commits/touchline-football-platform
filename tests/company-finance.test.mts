import test from "node:test";
import assert from "node:assert/strict";
import { companyContractMilestones, reconcileCompanyObligation, validateCompanyContract, validateCompanyMoney, type CompanySettlement, type CompanyObligation } from "../lib/admin/company-finance.ts";
const supplier = { id: "supplier", name: "Provider" };
const contract = { id: "contract", supplierId: supplier.id, title: "Service", startsOn: "2026-01-01", endsOn: "2026-12-31", renewalOn: "2027-01-01", cancellationDeadlineOn: "2026-12-01", documentReference: null };
const obligation:CompanyObligation = { id: "invoice", supplierId:supplier.id, contractId:contract.id, sourceReference:"mailbox/message/attachment", issuedOn:"2026-10-01", dueOn:"2026-10-25", amount:{currency:"EUR",minor:10000,exponent:2} };
const receipt:CompanySettlement = { id:"payment", obligationId:obligation.id, amount:{...obligation.amount,minor:4000}, paidOn:"2026-10-24", confirmation:"CONFIRMED",source:"MANUAL",sourceReference:"bank-statement-line-1",confirmedBy:"admin-actor" };
const reconcile=(settlements:CompanySettlement[]=[],today="2026-10-25")=>reconcileCompanyObligation({obligation,supplier,contract,settlements,today});
test("receiving an invoice or pending payment never marks it paid",()=>{
  assert.equal(reconcile().settlementState,"UNPAID");
  assert.equal(reconcile([{...receipt,confirmation:"PENDING",confirmedBy:null}]).paidMinor,0);
  assert.equal(reconcile().dueState,"DUE_TODAY");
});
test("manual confirmation accepts audited reference/actor without mandatory uploaded document",()=>{
  assert.equal(reconcile([receipt]).paidMinor,4000);
  assert.equal(reconcile([receipt]).outstandingMinor,6000);
  assert.equal(reconcile([receipt],"2026-10-26").dueState,"OVERDUE");
  assert.throws(()=>reconcile([{...receipt,confirmedBy:null}]),/ACTOR_REQUIRED/);
});
test("duplicate receipt is idempotent, conflicts and double source fail closed",()=>{
  assert.equal(reconcile([receipt,{...receipt}]).paidMinor,4000);
  assert.throws(()=>reconcile([receipt,{...receipt,amount:{...receipt.amount,minor:5000}}]),/CONFLICTING/);
  assert.throws(()=>reconcile([receipt,{...receipt,id:"second"}]),/DUPLICATE_SETTLEMENT_SOURCE/);
});
test("full settlement and overpayment remain distinct without automatic refunds",()=>{
  const full={...receipt,amount:{...receipt.amount,minor:10000}};
  assert.equal(reconcile([full]).settlementState,"PAID");
  assert.equal(reconcile([full]).dueState,"SETTLED");
  assert.equal(reconcile([{...full,amount:{...full.amount,minor:12000}}]).overpaidMinor,2000);
});
test("money rejects TC, fractions, unsafe sums and mixed currencies or unit conventions",()=>{
  for(const money of [{currency:"TC",minor:1,exponent:0},{currency:"EUR",minor:1.1,exponent:2},{currency:"EUR",minor:-1,exponent:2}])assert.throws(()=>validateCompanyMoney(money));
  for(const amount of [{...receipt.amount,currency:"USD"},{...receipt.amount,exponent:0}])assert.throws(()=>reconcile([{...receipt,amount}]),/MONEY_UNIT/);
  assert.throws(()=>reconcile([{...receipt,amount:{...receipt.amount,minor:Number.MAX_SAFE_INTEGER}},{...receipt,id:"2",sourceReference:"other",amount:{...receipt.amount,minor:1}}]),/OVERFLOW/);
});
test("strict dates, parent identity and confirmed future payments cannot slip into balances",()=>{
  assert.throws(()=>reconcile([],"2026-02-30"),/INVALID_DATE/);
  assert.throws(()=>reconcile([{...receipt,paidOn:"2026-10-26"}]),/INVALID_SETTLEMENT/);
  assert.throws(()=>reconcile([{...receipt,obligationId:"other"}]),/OBLIGATION_MISMATCH/);
  assert.throws(()=>reconcileCompanyObligation({obligation,supplier,contract:null,settlements:[],today:"2026-10-25"}),/CONTRACT_MISMATCH/);
  assert.throws(()=>validateCompanyContract({...contract,endsOn:"2025-12-31"},supplier),/INVALID_TERM/);
});
test("renewal, cancellation deadline and expiry are separate date-only reminders, not actions",()=>{
  const milestones=companyContractMilestones(contract,supplier,"2026-12-01",31);
  assert.equal(milestones.length,3);
  assert.equal(milestones[0].kind,"CANCELLATION_DEADLINE");assert.equal(milestones[0].state,"TODAY");
  assert.equal(milestones[2].days,31);
  assert.equal(companyContractMilestones({...contract,endsOn:null,renewalOn:null,cancellationDeadlineOn:null},supplier,"2026-12-01").length,0);
  assert.equal(companyContractMilestones(contract,supplier,"2026-12-02")[0].state,"PAST");
});
