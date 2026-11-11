const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const importExport=()=>import('data:text/javascript;base64,'+Buffer.from(read('v3/vehicle-export.js')).toString('base64'));
function unzipStored(bytes){
 const buffer=Buffer.from(bytes),entries=new Map();let pos=0;
 while(pos<buffer.length&&buffer.readUInt32LE(pos)===0x04034b50){
  const flags=buffer.readUInt16LE(pos+6),method=buffer.readUInt16LE(pos+8);
  const stored=buffer.readUInt32LE(pos+18),nameLen=buffer.readUInt16LE(pos+26),extra=buffer.readUInt16LE(pos+28);
  assert.equal(flags,0);assert.equal(method,0);
  const name=buffer.subarray(pos+30,pos+30+nameLen).toString('utf8');
  const start=pos+30+nameLen+extra;
  entries.set(name,buffer.subarray(start,start+stored).toString('utf8'));
  pos=start+stored;
 }
 assert.ok(buffer.readUInt32LE(pos)===0x02014b50,'ZIP central directory exists');
 assert.ok(buffer.includes(Buffer.from('PK\x05\x06','binary')),'ZIP end-of-central-directory marker exists');
 return entries;
}
test('plate/model always first and selected regardless of client choices',async()=>{
 const {VEHICLE_COLUMNS,selectedVehicleColumns}=await importExport();
 assert.ok(VEHICLE_COLUMNS.length>=10);
 const selection=selectedVehicleColumns(['brand','status']);
 assert.deepEqual(selection.map(x=>x.key),['plate','model','brand','status']);
 assert.deepEqual(selectedVehicleColumns([]).map(x=>x.key),['plate','model']);
});
test('real .xlsx package freezes A/B columns and header, preserves model and escapes unsafe text',async()=>{
 const {buildVehicleXlsx,selectedVehicleColumns}=await importExport();
 const columns=selectedVehicleColumns(['status','odometer_value']);
 const rows=[{plate:'ABC1D23',model:'Caminhão & Truck <600>',status:'=HYPERLINK("https://invalid.test")',odometer_value:82000}];
 const archive=unzipStored(buildVehicleXlsx(rows,columns));
 assert.equal(archive.size,6);
 for(const name of ['[Content_Types].xml','xl/worksheets/sheet1.xml','xl/workbook.xml','xl/styles.xml'])assert.ok(archive.has(name),name);
 const sheet=archive.get('xl/worksheets/sheet1.xml');
 assert.match(sheet,/<pane xSplit="2" ySplit="1" topLeftCell="C2"[^>]*state="frozen"/);
 assert.match(sheet,/Caminhão &amp; Truck &lt;600&gt;/);
 assert.match(sheet,/t="inlineStr"[^>]*><is><t xml:space="preserve">=HYPERLINK/);
 assert.doesNotMatch(sheet,/<f>/);
 assert.match(sheet,/<autoFilter ref="A1:D2"/);
 assert.match(sheet,/<c r="D2" s="2"><v>82000<\/v><\/c>/);
 assert.doesNotMatch(sheet,/Marca/);
});
test('workbook generation handles empty data and all-optional columns unselected',async()=>{
 const {buildVehicleXlsx,selectedVehicleColumns}=await importExport();
 const archive=unzipStored(buildVehicleXlsx([],selectedVehicleColumns([])));
 const sheet=archive.get('xl/worksheets/sheet1.xml');
 assert.match(sheet,/<dimension ref="A1:B1"/);
 assert.match(sheet,/<autoFilter ref="A1:B1"/);
 assert.doesNotMatch(sheet,/<row r="2">/);
});
test('company list maps contract name and driver and does not alter vehicles',async()=>{
 const {vehicleExportRows}=await importExport();
 const v={plate:'XRM1A23',model:'Utilitário',contract_id:'c1',driver_name:'Motorista teste'};
 const data=vehicleExportRows([v],[{id:'c1',name:'Contrato teste'}]);
 assert.equal(data[0].contract_name,'Contrato teste');
 assert.equal(data[0].driver_name,'Motorista teste');
 assert.equal(v.contract_name,undefined);
});
test('mileage is a distinct navigation page in desktop and mobile; dashboard routes to it',()=>{
 const html=read('v3/index.html'),adapter=read('v3/xrmovi-adapter.js'),mileage=read('v3/mileage.js'),mobile=read('v3/mobile-experience.js');
 assert.match(html,/<button class="fleet-subnav" id="xrm-mileage-nav"[^>]*data-view="mileage"/);
 assert.match(html,/<option value="mileage">KM e Troca de Óleo<\/option>/);
 assert.match(html,/<section id="view-mileage" class="fleet-view hidden"/);
 assert.ok(html.indexOf('id="view-mileage"')>html.indexOf('id="view-assets"'));
 assert.ok(html.indexOf('id="xrm-mileage-console"')>html.indexOf('id="view-mileage"'));
 assert.ok(adapter.includes("mileage:'KM e Troca de Óleo'"));
 assert.ok(mileage.includes('data-view="mileage"'));
 assert.ok(!mileage.includes('data-view="assets"'));
 assert.ok(mobile.includes("['mileage','clock','KM e Troca de Óleo']"));
 assert.ok(mobile.includes("{label:'Atualizar KM',view:'mileage'"));
 assert.ok(html.includes('id="xrm-export-vehicles"'));
 assert.ok(adapter.includes('setupVehicleExport('));
});
