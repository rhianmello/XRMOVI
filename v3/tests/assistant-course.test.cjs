'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const courseSource=fs.readFileSync(path.join(__dirname,'..','xrmovi-guide-course.js'),'utf8');
function course(){
 const window={};vm.runInNewContext(courseSource,{window},{timeout:1000});
 return window.XrmoviGuideCourse;
}
test('41 or more training chapters available by group and no network access',()=>{
 const c=course();assert.ok(c.topics.length>=40);
 assert.ok(c.chapters().includes('Quilometragem'));
 assert.ok(c.topics.every(x=>x.title&&x.intro&&x.steps.length>=3&&x.aliases.length>0));
 assert.ok(c.topics.every(x=>!String(x.intro).includes('http')));
});
test('natural Portuguese questions route to the correct verified procedure',()=>{
 const c=course();
 const mismatches=[];
 for (const [q,id] of [
  ['como cadastrar um carro','vehicle-add'],
  ['onde mudo o status do carro','vehicle-edit'],
  ['o que e operacional','operational'],
  ['como registrar um abastecimento','fuel'],
  ['como configurar troca de oleo','oil-plan'],
  ['como atualizar o km','km-entry'],
  ['onde vejo o historico do km','km-history'],
  ['como exportar csv','export'],
  ['como salvar pdf','export'],
  ['como cadastrar um motorista','drivers'],
  ['como vincular motorista','driver-link'],
  ['como programar manutencao','maintenance-plan'],
  ['como concluir manutencao','maintenance-close'],
  ['como cadastrar uma despesa','expenses'],
  ['como criar contrato','contracts'],
  ['como adicionar empresa','company-add'],
  ['como trocar plano','change-plan'],
  ['como adicionar usuario','users'],
  ['como pedir suporte','support'],
  ['como trocar logo','logo'],
  ['esqueci minha senha','password'],
  ['como usar o qr code','qr'],
  ['como filtrar por contrato','filters'],
  ['eu quero saber como faço para colocar o carro em manutenção','vehicle-edit'],
  ['me ensina a fazer cadastro de um caminhão','vehicle-add'],
  ['tem como lançar o km de vários carros de uma vez','km-bulk'],
  ['como consertar o KM errado que eu cadastrei','km-history'],
  ['tenho um motorista com a CNH vencida, o que faço','cnh'],
  ['como é que eu gero o PDF do relatório','export'],
  ['como pagar a mensalidade da minha assinatura','change-plan'],
  ['quero cadastrar a logo da minha empresa','logo'],
  ['como alterar a senha da conta','password'],
  ['como eu vejo o histórico do abastecimento','history'],
  ['como mudar o contrato de um carro','contracts'],
  ['como fazer os documentos do carro','documents'],
  ['o que significa vencido no painel','alerts'],
  ['minha tela tá zerada, e agora?','troubleshoot'],
 ]){
  const found=c.find(q);
  if(found?.id!==id)mismatches.push(q+' -> '+(found?.id||'nenhuma')+' (esperado: '+id+')');
 }
 assert.deepEqual(mismatches,[]);
});
test('unsupported topics do not fabricate help',()=>{
 const c=course();
 assert.equal(c.find('quanto vai chover em sao goncalo'),null);
 assert.equal(c.find('qual e a minha senha'),null);
 assert.equal(c.find(''),null);
});
test('step by step answer contains the real steps and role restrictions',()=>{
 const c=course(),lesson=c.getById('maintenance-close');
 const text=c.answer(lesson);
 assert.ok(text.includes('Passo a passo:'));
 assert.ok(text.includes('1.'));
 assert.ok(text.includes('proprietário ou gestor'));
});
