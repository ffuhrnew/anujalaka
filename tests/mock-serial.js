(() => {
  const FEND=0xC0, FESC=0xDB, TFEND=0xDC, TFESC=0xDD;
  const dev = { rom: new Array(256).fill(0xFF), target: new Array(32).fill(0xFF), booted: false, dropHashOnce: true, resets: 0 };
  const REAL = Array.from({length:32}, (_,i)=> (i*7+3)&0xff);
  const esc = (b) => b.flatMap(x => x===FEND?[FESC,TFEND]: x===FESC?[FESC,TFESC]:[x]);
  const frame = (cmd, data) => [FEND, ...esc([cmd, ...data]), FEND];
  const ports = []; const events = new EventTarget();
  class FakePort {
    constructor(){ this.gen = ++FakePort.n; this.dead=false; this.isOpen=false; ports.push(this); }
    getInfo(){ return {usbVendorId:0x303a, usbProductId:0x1001}; }
    async setSignals(){}
    async open(){
      if (this.dead) throw new DOMException("The device has been lost.", "NetworkError");
      this.isOpen = true; let ctl;
      this.readable = new ReadableStream({ start: (c)=>{ ctl=c; this.ctl=c; } });
      // erster Empfang beginnt mitten in einem Rahmen (Ausrichtungsfehler)
      setTimeout(()=>{ try{ ctl.enqueue(new Uint8Array([0x41,0x42,FEND])); }catch(_){} }, 20);
      let buf=[], inF=false;
      this.writable = new WritableStream({ write: (chunk)=>{
        for (const b of chunk) {
          if (b===FEND) { if (buf.length) this.handle(buf); buf=[]; } else buf.push(b);
        }
      }});
    }
    send(bytes){ try{ this.ctl.enqueue(new Uint8Array(bytes)); }catch(_){} }
    handle(raw){
      const f=[]; let e=false; for (const b of raw){ if(e){f.push(b===TFEND?FEND:FESC);e=false;} else if(b===FESC)e=true; else f.push(b); }
      const [cmd,...d]=f;
      if (cmd===0x08) this.send(frame(0x08,[0x46]));
      else if (cmd===0x51) this.send(frame(0x51,dev.rom));
      else if (cmd===0x52) { dev.rom[d[0]]=d[1]; }
      else if (cmd===0x58) { dev.target = d.slice(0,32); }
      else if (cmd===0x60) {
        if (dev.dropHashOnce && d[0]===0x02) { dev.dropHashOnce=false; return; }
        const h = d[0]===0x01 ? dev.target : (dev.booted ? REAL : new Array(32).fill(0));
        this.send(frame(0x60,[d[0],...h]));
      }
      else if (cmd===0x55) this.reset();
    }
    reset(){
      dev.resets++; this.dead=true; this.isOpen=false;
      try{ this.ctl.error(new TypeError("lost")); }catch(_){}
      dev.booted = dev.rom[0x9B]===0x73;
      setTimeout(()=>{ const np=new FakePort(); const ev=new Event("connect"); Object.defineProperty(ev,"target",{value:np}); events.dispatchEvent(ev); }, 1500);
    }
    async close(){ this.isOpen=false; }
  }
  FakePort.n=0;
  const first = new FakePort();
  Object.defineProperty(navigator,'serial',{value:{
    requestPort: async()=>first,
    getPorts: async()=>ports.filter(p=>!p.dead),
    addEventListener:(...a)=>events.addEventListener(...a),
    removeEventListener:(...a)=>events.removeEventListener(...a),
  }});
  window.__dev=dev; window.__REAL=REAL;
})();
