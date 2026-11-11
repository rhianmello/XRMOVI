(function () {
  'use strict';

  // Relatório financeiro da frota: resumo consolidado e comprovantes por veículo.
  function create({records, receipts, from, to, posto, filename}) {
    if (!window.jspdf?.jsPDF) throw new Error('Biblioteca de PDF indisponível.');
    const pdf = new window.jspdf.jsPDF({orientation:'portrait', unit:'mm', format:'a4', compress:true});
    const W=210, H=297, M=13, usable=W-2*M, bottom=280;
    const C={navy:[12,33,53], navy2:[20,48,74], cyan:[0,150,186],
      ink:[22,42,60], muted:[96,116,131], line:[214,225,233],
      light:[244,248,251], white:[255,255,255], green:[4,117,103]};
    const setFill=rgb=>pdf.setFillColor(...rgb);
    const setText=rgb=>pdf.setTextColor(...rgb);
    const setDraw=rgb=>pdf.setDrawColor(...rgb);
    const brMoney=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const brNum=(v,digits=2)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
    const asDate=v=>{
      const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v||''));
      return m?m[3]+'/'+m[2]+'/'+m[1]:String(v||'-');
    };
    const printable=s=>String(s??'-').replace(/[\r\n\t]+/g,' ').trim()||'-';
    const clean=(s,n=42)=>{const value=printable(s);return value.length>n?value.slice(0,n-1)+'…':value;};
    const drawText=(txt,x,y,size=9,color=C.ink,bold=false,align)=>{
      setText(color);pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);
      pdf.text(printable(txt),x,y,align?{align}:undefined);
    };
    const line=(x,y,toX)=>{setDraw(C.line);pdf.setLineWidth(.25);pdf.line(x,y,toX,y);};
    function pageHeader(kicker) {
      setFill(C.navy);pdf.rect(0,0,W,27,'F');
      setFill(C.cyan);pdf.rect(0,26,W,1.2,'F');
      drawText('CPL CONSTRUTORA',M,11.5,13,C.white,true);
      drawText('GESTÃO DE FROTA  /  COMBUSTÍVEL',M,18.7,7.3,[178,210,226]);
      drawText(kicker||'RELATÓRIO DE ABASTECIMENTO',W-M,15.1,7.3,C.white,true,'right');
    }
    function nextPage(kicker){
      pdf.addPage();pageHeader(kicker);
    }
    function sectionTitle(title,y){
      drawText(title,M,y,11,C.navy,true);
      setFill(C.cyan);pdf.roundedRect(M,y+3,26,1.2,.5,.5,'F');
      return y+11;
    }
    function summaryRow(columns,y,{header=false,alternate=false,height=8}={}){
      if(header||alternate){setFill(header?C.navy2:C.light);pdf.rect(M,y,usable,height,'F');}
      const positions=columns.length===4?[M+3,M+79,M+117,W-M-3]:
        [M+3,M+98,W-M-3];
      columns.forEach((col,i)=>{
        const align=i===columns.length-1?'right':'left';
        drawText(clean(col,i===0?37:23),positions[i],y+height*.67,header?7.3:8,header?C.white:C.ink,header||i===columns.length-1,align);
      });
      line(M,y+height,W-M);
    }
    const groups=new Map();
    for(const r of records) {
      const plate=printable(r.placa||'Sem placa');
      const key=String(r.asset_id||plate);
      if(!groups.has(key)) groups.set(key,{plate,model:printable(r.modelo||'Veículo'),records:[],total:0,liters:0});
      const g=groups.get(key);g.records.push(r);
      g.total+=Number(r.valor||0);g.liters+=Number(r.quantidade||0);
    }
    const vehicles=[...groups.values()].sort((a,b)=>a.plate.localeCompare(b.plate,'pt-BR'));
    const attached=new Map(receipts.map(r=>[String(r.fuelingId),r]));
    const count=records.length,total=records.reduce((sum,r)=>sum+Number(r.valor||0),0);
    const stationNames=new Set(records.map(r=>printable(r.posto||'Não informado')));
    pageHeader('FECHAMENTO FINANCEIRO');
    let y=38;
    drawText('Relatório de abastecimento',M,y,18,C.navy,true);y+=8;
    drawText('Período: '+asDate(from)+' a '+asDate(to)+'  |  Posto: '+printable(posto||'Todos os postos'),M,y,8.5,C.muted);y+=8;
    const cells=[
      ['ABASTECIMENTOS',count],
      ['VEÍCULOS',vehicles.length],
      ['POSTOS',stationNames.size],
      ['VALOR TOTAL',brMoney(total)]
    ];
    const gap=3,cellWidth=(usable-3*gap)/4;
    cells.forEach(([key,value],i)=>{
      const x=M+i*(cellWidth+gap);
      setFill(C.light);setDraw(C.line);pdf.roundedRect(x,y,cellWidth,25,2,2,'FD');
      drawText(key,x+4,y+8,6.4,C.muted,true);
      drawText(value,x+4,y+18.5,i===3?11:16,i===3?C.green:C.navy,true);
    });y+=36;
    y=sectionTitle('RESUMO POR POSTO  /  VALORES PARA PAGAMENTO',y);
    summaryRow(['Posto','Abastec.','Valor total'],y,{header:true});y+=8;
    const byPost=new Map();
    for(const r of records) {
      const key=printable(r.posto||'Não informado');
      if(!byPost.has(key))byPost.set(key,{count:0,value:0});
      const agg=byPost.get(key);agg.count++;agg.value+=Number(r.valor||0);
    }
    const stations=[...byPost.entries()].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR'));
    for(const [i,item] of stations.entries()){
      if(y+9>bottom-17){nextPage('RESUMO  /  POSTOS');y=39;summaryRow(['Posto','Abastec.','Valor total'],y,{header:true});y+=8;}
      summaryRow([item[0],String(item[1].count),brMoney(item[1].value)],y,{alternate:i%2===1});y+=8;
    }
    if(y+9>bottom-17){nextPage('RESUMO  /  POSTOS');y=39;}
    setFill([231,245,246]);pdf.rect(M,y,usable,9,'F');
    summaryRow(['TOTAL GERAL',String(count),brMoney(total)],y,{height:9});y+=21;
    if(y+23+Math.min(vehicles.length,2)*8>bottom){nextPage('RESUMO  /  VEÍCULOS');y=39;}
    y=sectionTitle('RESUMO POR VEÍCULO',y);
    summaryRow(['Placa / modelo','Abastec.','Litros','Valor total'],y,{header:true});y+=8;
    for(const [i,g] of vehicles.entries()){
      if(y+9>bottom-17){nextPage('RESUMO  /  VEÍCULOS');y=39;summaryRow(['Placa / modelo','Abastec.','Litros','Valor total'],y,{header:true});y+=8;}
      summaryRow([g.plate+' / '+g.model,String(g.records.length),brNum(g.liters),brMoney(g.total)],y,{alternate:i%2===1});y+=8;
    }
    y+=9;
    if(y+10>bottom){nextPage('ORIENTAÇÕES');y=42;}
    drawText('Nas próximas páginas: lançamentos e fotos agrupados por veículo.',M,y,8.5,C.muted);
    y+=6;drawText('Comprovantes não anexados são identificados para conferência.',M,y,8,C.muted);

    vehicles.forEach((g,vehicleIndex)=>{
      g.records.sort((a,b)=>String(a.data_abastecimento||'').localeCompare(String(b.data_abastecimento||'')));
      const vehicleReceipts=g.records.filter(r=>attached.has(String(r.id))).length;
      g.records.forEach((r,recordIndex)=>{
        nextPage('COMPROVANTES  /  VEÍCULO '+(vehicleIndex+1)+' DE '+vehicles.length);
        // Card superior do veículo com totais para conferência.
        setFill(C.light);setDraw(C.line);pdf.roundedRect(M,36,usable,44,2,2,'FD');
        drawText('VEÍCULO '+(vehicleIndex+1)+' / '+vehicles.length+'  •  '+g.plate,M+5,45,13,C.navy,true);
        drawText(clean(g.model,68),M+5,52,9,C.muted);
        line(M+5,56,W-M-5);
        drawText('ABASTECIMENTOS  '+g.records.length,M+5,64,8.2,C.ink,true);
        drawText('FOTOS  '+vehicleReceipts+' / '+g.records.length,M+5,71.5,8.2,C.muted,true);
        drawText('TOTAL DO VEÍCULO',W-M-5,64,7.6,C.muted,true,'right');
        drawText(brMoney(g.total),W-M-5,73,12,C.green,true,'right');

        setFill(C.navy2);pdf.roundedRect(M,86,usable,11,1.8,1.8,'F');
        drawText('ABASTECIMENTO '+(recordIndex+1)+' DE '+g.records.length,M+4,93.4,9,C.white,true);
        drawText('NOTA '+clean(r.numero_nota||'NÃO INFORMADA',25),W-M-4,93.4,8,C.white,true,'right');

        const fields=[
          {label:'DATA DO ABASTECIMENTO',value:asDate(r.data_abastecimento)},
          {label:'MOTORISTA / RESPONSÁVEL',value:r.responsavel||'Não informado'},
          {label:'POSTO',value:r.posto||'Não informado'},
          {label:'VALOR DO ABASTECIMENTO',value:brMoney(r.valor)},
          {label:'KM REGISTRADO',value:r.km_atual==null?'Não informado':brNum(r.km_atual,0)+' km'},
          {label:'COMBUSTÍVEL / LITROS',value:printable(r.combustivel)+'  /  '+(r.quantidade==null?'Sem volume':brNum(r.quantidade)+' L')}
        ];
        setFill(C.light);setDraw(C.line);pdf.roundedRect(M,102,usable,40,2,2,'FD');
        fields.forEach((field,i)=>{
          const x=M+5+(i%2)*92, fy=109+Math.floor(i/2)*12.2;
          drawText(field.label,x,fy,6.25,C.muted,true);
          drawText(clean(field.value,34),x,fy+5.2,i===3?10:8.3,i===3?C.green:C.ink,true);
        });
        drawText('COMPROVANTE FOTOGRÁFICO',M,151,9.5,C.navy,true);
        const imageY=156, imageH=116,imageW=usable;
        setDraw(C.line);setFill([249,251,253]);pdf.roundedRect(M,imageY,imageW,imageH,2,2,'FD');
        const receipt=attached.get(String(r.id));
        if(receipt && receipt.data){
          try{
            const dims=pdf.getImageProperties(receipt.data);
            const maxW=imageW-8,maxH=imageH-8;
            const k=Math.min(maxW/dims.width,maxH/dims.height);
            const w=dims.width*k,h=dims.height*k;
            pdf.addImage(receipt.data,'JPEG',M+(imageW-w)/2,imageY+(imageH-h)/2,w,h);
          }catch(error){
            throw new Error('Falha ao inserir a foto da placa '+g.plate+' ('+asDate(r.data_abastecimento)+'). O PDF não foi emitido incompleto: '+(error?.message||error));
          }
        }else{
          drawText('SEM FOTO ANEXADA',W/2,imageY+imageH/2-3,11,C.muted,true,'center');
          drawText('O lançamento financeiro permanece no relatório.',W/2,imageY+imageH/2+6,8,C.muted,false,'center');
        }
        drawText('Placa '+g.plate+'  |  '+asDate(r.data_abastecimento)+'  |  '+brMoney(r.valor),M,277,8,C.muted);
      });
    });
    const pageTotal=pdf.internal.getNumberOfPages();
    for(let p=1;p<=pageTotal;p++){
      pdf.setPage(p);
      line(M,283,W-M);
      drawText('CPL CONSTRUTORA  •  CONTROLE DE COMBUSTÍVEL',M,289,7,C.muted);
      drawText('Página '+p+' de '+pageTotal,W-M,289,7,C.muted,true,'right');
    }
    pdf.save(filename+'.pdf');
    return pageTotal;
  }

  window.FleetFuelReportPDF={create};
}());