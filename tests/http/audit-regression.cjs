const {createHash}=require('node:crypto');
const path=require('node:path');
const {computeHash,AuditTrailGenerator}=require(path.resolve(process.argv[2]||'.','dist/export/AuditTrailGenerator.js'));
const hash=s=>createHash('sha256').update(s).digest('hex');
const check=fn=>{try{return fn()===true}catch{return false}};
const holdout=[
  check(()=>computeHash(undefined)===hash('undefined')),
  check(()=>{const g=new AuditTrailGenerator();return g.recordStep({operation:'missing-input',inputData:undefined,outputData:{ok:true}}).stepNumber===1}),
  check(()=>{const g=new AuditTrailGenerator();return g.recordStep({operation:'missing-output',inputData:null,outputData:undefined}).outputHash===hash('undefined')}),
  check(()=>{const g=new AuditTrailGenerator();const circular={};circular.self=circular;try{g.recordStep({operation:'invalid',inputData:{},outputData:circular})}catch{}return g.recordStep({operation:'valid',inputData:{},outputData:{}}).stepNumber===1}),
];
const anchors=[check(()=>computeHash(null)===hash('null')),check(()=>computeHash('raw')===hash('raw')),check(()=>computeHash({a:1})===hash('{"a":1}')),check(()=>{const g=new AuditTrailGenerator();return [1,2].every(n=>g.recordStep({operation:'ok',inputData:n,outputData:n}).stepNumber===n)})];
console.log(JSON.stringify({holdout,anchors}));
if([...holdout,...anchors].some(x=>!x))process.exitCode=1;
