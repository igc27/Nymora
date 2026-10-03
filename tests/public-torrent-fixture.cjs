'use strict';
const http = require('node:http');
const SOURCE = {
  name: 'Sintel · public internet peers · CC BY 3.0',
  infoHash: '08ada5a7a6183aae1e09d831df6748d566095a10', fileIdx: 5,
  sources: ['tracker:udp://tracker.opentrackr.org:1337/announce','tracker:udp://explodie.org:6969/announce'],
  behaviorHints: { filename: 'Sintel.mp4', videoSize: 129241752 }
};
async function startPublicFixture() {
  const requests = []; let base;
  const movie = { id:'nymora:public-sintel', type:'movie', name:'Sintel · legal public torrent', description:'Blender Foundation, Creative Commons Attribution 3.0. Official WebTorrent free torrent list. Metadata and video bytes must come from existing public peers.' };
  const manifest = { id:'org.nymora.public-test', name:'Legal public peer test', version:'1.0.0', description:'Developer-only public torrent compatibility fixture. No torrent seed, HTTP video or metadata webseed.', resources:['catalog','meta','stream','subtitles'], types:['movie'], idPrefixes:['nymora:'], catalogs:[{id:'public-test',type:'movie',name:'Public P2P test'}] };
  const server = http.createServer((req,res)=>{
    requests.push({url:req.url,time:Date.now()}); res.setHeader('Content-Type','application/json');
    const send = value => res.end(JSON.stringify(value));
    if(req.url==='/manifest.json') return send(manifest);
    if(req.url==='/broken/manifest.json')return send({...manifest,id:'org.nymora.public-offline',name:'Offline test addon',resources:['stream'],catalogs:[]});
    if(req.url.startsWith('/broken/')){res.writeHead(503);return res.end();}
    if(req.url.startsWith('/catalog/'))return send({metas:[movie]});
    if(req.url.startsWith('/meta/'))return setTimeout(()=>send({meta:movie}),800);
    if(req.url.startsWith('/stream/'))return send({streams:[SOURCE]});
    if(req.url.startsWith('/subtitles/'))return send({subtitles:['eng','ara'].map(lang=>({id:lang,lang,label:lang==='eng'?'English · original QA cues':'Arabic · العربية · original QA cues',url:base+'/subtitle/'+lang+'.srt'}))});
    if(req.url.startsWith('/subtitle/')){res.setHeader('Content-Type','text/plain; charset=utf-8');return res.end('1\n00:00:00,000 --> 00:15:00,000\n'+(req.url.includes('ara')?'ترجمة اختبار أصلية للفيديو المرخص':'Original QA subtitle for licensed video')+'\n');}
    res.writeHead(404);res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  return {server,base,movie,requests,source:SOURCE,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
module.exports = { startPublicFixture, SOURCE };
