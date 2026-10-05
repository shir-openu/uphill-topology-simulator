// A continuous introduction on the real interface with reversible preview edits.
export function installLiveTour(api) {
  const defaultSpeed = 1;
  const helpReadingDuration = 4000;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const style = document.createElement('style');
  style.id = 'live-tour-style';
  style.textContent = `
    #live-tour{position:fixed;inset:0;z-index:8500;pointer-events:none;color:#f5ecff;font-family:inherit}
    #live-tour[hidden]{display:none!important}
    #live-tour .live-tour-layer{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
    #live-tour .live-tour-arrow{fill:none;stroke:#c6a2ff;stroke-width:4;stroke-linecap:round;filter:drop-shadow(0 2px 5px #26123899)}
    #live-tour .live-tour-halo{fill:#bd8cff0c;stroke:#c6a2ff;stroke-width:2.5}
    #live-tour .live-tour-click{fill:none;stroke:#ff9ccd;stroke-width:3}
    #live-tour .live-tour-cursor{position:absolute;width:33px;height:43px;overflow:visible;filter:drop-shadow(0 2px 4px #0009);transform-origin:5px 3px}
    #live-tour .live-tour-bar{position:absolute;right:16px;bottom:14px;width:min(490px,calc(100vw - 32px));box-sizing:border-box;padding:12px 16px;border:1px solid #b695e28c;border-radius:18px;background:#171a30f7;box-shadow:0 8px 35px #0006;pointer-events:auto;backdrop-filter:blur(10px)}
    #live-tour .live-tour-bar[data-dock=top]{top:14px;bottom:auto}
    #live-tour .live-tour-file-preview{margin:8px 0;padding:9px;border:1px solid #bd8ddd70;border-radius:10px;background:#292139e8;font-size:14px;max-height:220px;overflow:auto}
    #live-tour .live-tour-file-preview p{margin:5px 0;font-size:13px}
    #live-tour .live-tour-file-preview iframe{border:0;background:#fff;width:100%;height:135px}
    #live-tour .live-tour-file-preview pre{white-space:pre-wrap;word-break:break-word;max-height:130px;overflow:auto;font-size:12px;margin:5px 0}
    #live-tour .live-tour-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#dbbafc;font-size:14px;font-weight:700}
    #live-tour .live-tour-caption{font-size:20px;font-weight:600;line-height:1.28;margin:9px 0;min-height:51px;color:#f8edff}
    #live-tour .live-tour-chapters,#live-tour .live-tour-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    #live-tour .live-tour-chapters{margin-top:8px}
    #live-tour button,#live-tour select{font-family:inherit;font-size:15px;font-weight:600;line-height:1.2;min-height:40px;padding:8px 10px;cursor:pointer;border-radius:10px;border:1px solid #766085;background:#39304f;color:#f5e8ff;box-shadow:none}
    #live-tour button:focus-visible,#live-tour select:focus-visible{outline:3px solid #f3b2d5;outline-offset:3px}
    #live-tour button:hover{background:#514168}
    #live-tour .live-tour-chapters button{flex:1;padding:6px 8px;min-height:35px;font-size:14px}
    #live-tour .live-tour-chapters [aria-current=step]{background:#743166;border-color:#d893c4}
    #live-tour .live-tour-skip{margin-left:auto;background:#17676e;border-color:#39a2aa;color:#edffff}
    #live-tour .live-tour-speed{display:flex;align-items:center;gap:4px;font-size:13px;color:#d9c8ed}
    #live-tour .live-tour-speed select{padding:7px 3px;min-width:59px}
    #live-tour .live-tour-progress{height:3px;background:#6a507d66;border-radius:3px;overflow:hidden;margin-top:10px}
    #live-tour .live-tour-progress span{display:block;height:100%;background:linear-gradient(90deg,#b56194,#bb95f0,#44c6c2);width:0}
    .live-tour-control-focus{outline:2px solid #c6a2ff!important;outline-offset:4px;box-shadow:inset 0 0 14px #b27cf626,0 0 18px #b27cf633!important}
    @media(max-width:700px){#live-tour .live-tour-bar{left:8px;right:8px;bottom:8px;width:auto;padding:9px 11px;border-radius:14px}
      #live-tour .live-tour-bar[data-dock=top]{top:8px;bottom:auto}
      #live-tour .live-tour-file-preview{margin:8px 0;padding:9px;border:1px solid #bd8ddd70;border-radius:10px;background:#292139e8;font-size:14px;max-height:220px;overflow:auto}
    #live-tour .live-tour-file-preview p{margin:5px 0;font-size:13px}
    #live-tour .live-tour-file-preview iframe{border:0;background:#fff;width:100%;height:135px}
    #live-tour .live-tour-file-preview pre{white-space:pre-wrap;word-break:break-word;max-height:130px;overflow:auto;font-size:12px;margin:5px 0}
    #live-tour .live-tour-heading{font-size:12px}#live-tour .live-tour-caption{font-size:17px;min-height:43px;margin:7px 0}
      #live-tour button,#live-tour select{font-size:14px;min-height:38px;padding:7px 9px}
      #live-tour .live-tour-chapters{margin-top:6px}#live-tour .live-tour-chapters button{font-size:13px;min-height:31px}
      #live-tour .live-tour-actions{gap:5px}#live-tour .live-tour-progress{margin-top:8px}}
    @media(prefers-reduced-motion:reduce){#live-tour .live-tour-cursor{display:none}}
  `;
  document.head.append(style);
  const root = document.createElement('div');
  root.id = 'live-tour'; root.hidden = true;
  Object.assign(root.dataset, { active:'false', playing:'false', step:'-1', target:'', chapter:'', speed:String(defaultSpeed), covered:'[]', skipped:'[]' });
  root.innerHTML = `<svg class="live-tour-layer" aria-hidden="true"><defs><marker id="live-tour-arrowhead" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="6" markerHeight="6" orient="auto"><path d="M1 1 L10 6 L1 11" fill="none" stroke="#c6a2ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></marker></defs><rect class="live-tour-halo" rx="11"/><path class="live-tour-arrow"/><circle class="live-tour-click"/></svg>
    <svg class="live-tour-cursor" viewBox="0 0 33 43" aria-hidden="true"><path d="M4 2 L4 31 L12 24 L19 39 L26 35 L18 21 L30 20 Z" fill="#d4b3ff" stroke="#24162f" stroke-width="2"/></svg>
    <section class="live-tour-bar" aria-label="Automatic introduction"><div class="live-tour-heading"><span>Watch the real controls</span><span class="live-tour-count"></span></div><nav class="live-tour-chapters" aria-label="Introduction chapters">${['Basics','Edit','View','Workbench'].map(name=>`<button type="button" data-live-chapter="${name.toLowerCase()}">${name}</button>`).join('')}</nav><p class="live-tour-caption" role="status" aria-live="polite"></p><div class="live-tour-actions"><button id="live-tour-back" type="button" aria-label="Previous demonstration">‹</button><button id="live-tour-pause" type="button">Ⅱ Pause</button><button id="live-tour-next" type="button" aria-label="Next demonstration">›</button><label class="live-tour-speed">Speed<select id="live-tour-speed" aria-label="Introduction speed"><option value="0.25">0.25×</option><option value="0.4">0.4× slow</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><button id="live-tour-replay" type="button" aria-label="Replay introduction">↻</button><button id="live-tour-skip" type="button" class="live-tour-skip">Explore</button></div><div class="live-tour-progress" aria-hidden="true"><span></span></div></section>`;
  document.body.append(root);
  const $=selector=>root.querySelector(selector);
  const bar=$('.live-tour-bar'),halo=$('.live-tour-halo'),arrow=$('.live-tour-arrow');
  const clickRing=$('.live-tour-click'),cursor=$('.live-tour-cursor'),caption=$('.live-tour-caption');
  const pauseButton=$('#live-tour-pause'),chapterButtons=[...root.querySelectorAll('[data-live-chapter]')];
  const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,value));
  const ease=value=>{const t=clamp(value);return t<.5?2*t*t:1-(-2*t+2)**2/2;};
  const mix=(a,b,fraction)=>a+(b-a)*fraction;
  const pointMix=(a,b,fraction)=>({x:mix(a.x,b.x,fraction),y:mix(a.y,b.y,fraction)});
  const act=(name,args)=>api.act(name,args||{});
  const query=selector=>{const target=()=>document.querySelector(selector);target.selector=selector;return target;};
  const vertex=id=>[...document.querySelectorAll('#graph .vtx')].find(el=>el.dataset.v===String(typeof id==='function'?id():id));
  const vertexTarget=id=>{const target=()=>vertex(id);target.selector=()=>`#graph .vtx[data-v="${CSS.escape(String(typeof id==='function'?id():id))}"]`;return target;};
  const label=id=>String(api.getState().graph.nodes.find(node=>String(node.id)===String(id))?.label??id);
  let running=false,playing=false,frame=null,autoStart=null,generation=0,speed=defaultSpeed,blinkSettledAt=null;
  let steps=[],index=-1,segment=-1,elapsed=0,segmentStart=0,previousTime=0,clockTime=0;
  let activeCue=null,cursorAt=null,cursorFrom=null,scrollTrack=null,innerScrollTracks=[],scrollDirty=false,focusElement=null;
  let helpReadingRemaining=0,helpReadingDone=false,helpReadingIdentity=null;
  let originalScroll=null,coverage=new Set(),skipped=[],context={},motionData=null,actionDone=false,visibleActionFrames=0,visibleActionSince=null,actionAt=null,segmentReplaying=false;
  function cue(key,target,text,duration=1400,action=null,enter=null,motion=null){return{key,target:typeof target==='string'?query(target):target,text,duration,action,enter,motion};}
  function group(key,text,duration,targets,enter=null){return{key,text,duration,targets,enter};}
  function graphPoint(point){const svg=document.querySelector('#graph svg'),p=typeof point==='function'?point():point;if(!svg||!p)return null;const m=svg.getScreenCTM();return m?{x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f}:null;}
  function pointTarget(point){const target=query('#graph');target.graphPoint=point;return target;}
  function capturePositions(){return Object.fromEntries(Object.entries(api.getState().graph.layout).map(([id,p])=>[id,{x:p.x,y:p.y}]));}
  function edgePoint(){const positions=Object.values(api.getState().graph.layout),xs=positions.map(p=>p.x),ys=positions.map(p=>p.y);return{x:(Math.min(...xs)+Math.max(...xs))/2,y:Math.max(...ys)+115};}
  function buildSteps() {
    context={extra:'d',addPoint:null};
    const initial=[...new Set(api.demoAnchors?.()||[])].filter(id=>vertex(id)).slice(0,3),a=initial[0],b=initial[1],third=initial[2];
    const chapters={basics:[],edit:[],view:[],workbench:[]};
    const add=(chapter,...items)=>chapters[chapter].push(...items);
    const normal=(name,args)=>()=>act(name,args);
    const clickDemo=selector=>()=>{const el=document.querySelector(selector);if(el&&!el.disabled)el.click();};
    const family=(key,selector,text,action=null,enter=null)=>cue(key,selector,text,0,action,enter);
    const setField=(selector,value,event='input')=>()=>{const el=document.querySelector(selector);if(el){el.value=value;el.dispatchEvent(new Event(event,{bubbles:true}));}};
    const seedPath=()=>{act('preset',{id:'path3'});act('mode',{value:'strict'});};
    const primaryPreset=api.getState().presetId;
    const primaryCard=primaryPreset?document.querySelector(`[data-playground="${CSS.escape(primaryPreset)}"]`):null;
    const pictureSelector=primaryCard?`[data-playground="${CSS.escape(primaryPreset)}"]`:'#preset-fan-list .preset-card';
    const primaryName=primaryCard?.querySelector('.preset-name')?.textContent||'your current graph';
    const pairOverlaps=b!==undefined&&api.getState().model.topo.N[api.getState().graph.index.get(a)]
      .some((bit,index)=>bit&&api.getState().model.topo.N[api.getState().graph.index.get(b)][index]);
    const blinkCue=(...args)=>({...cue(...args),waitForBlink:true});
    add('basics',cue('welcome','#watch-guide','Watch a short demonstration. Touch to take over.',1300),
      cue('picture-presets','#preset-fan-toggle','Hover to open the picture presets.',2000,()=>api.fan('open')),
      cue('picture-presets-preview',pictureSelector,'Move over a picture to see its graph and explanation.',1600),
      cue('picture-presets-close','#graph','Move away and the picture fan closes.',1600,()=>api.fan('close')),
      cue('picture-presets-reopen','#preset-fan-toggle','Return to the stack to open the pictures again.',1600,()=>api.fan('open')),
      primaryCard
        ? cue('picture-preset-current',pictureSelector,`Choose ${primaryName}. We will explore this graph together.`,1800,clickDemo(pictureSelector))
        : cue('picture-preset-current','#graph','We will keep your current graph for the demonstration.',1800,()=>api.fan('close')),
      cue('preset-chooser','#preset','Choose a graph.',1500),
      cue('topology','#mode','Choose the topology.',1500),
      cue('undirected-edges','#graph','Edges are undirected. Arrows show allowed uphill steps.',3000),
      cue('select','[data-tool="select"]','Click a vertex to show its set.',1500,()=>api.setTool('select')));
    if(a!==undefined){
      add('basics',blinkCue(`vertex:${a}`,vertexTarget(a),`Click ${label(a)}. Its complete neighbourhood blinks three times, then stays coloured.`,3800,()=>{act('details',{id:a});api.select([a]);},()=>api.select([])));
      if(b!==undefined)add('basics',blinkCue(`vertex:${b}`,vertexTarget(b),`Click ${label(b)} too. Its new neighbourhood blinks. ${pairOverlaps?'Purple marks their overlap.':'These two sets are disjoint.'}`,3800,()=>{act('details',{id:b});api.select([a,b]);}),
        cue('colour-key','.story-region-key',pairOverlaps?'One colour per set; purple means both.':'One colour per set. There is no overlap in this pair.',3000));
      if(third!==undefined)add('basics',
        blinkCue(`vertex:${third}:third`,vertexTarget(third),`Click ${label(third)} too. Its neighbourhood blinks, then shared colours show every overlap.`,3800,()=>{act('details',{id:third});api.select([a,b,third]);}),
        cue('many-set-key','.story-region-key','Divided vertices belong to several sets.',2600),
        cue(`vertex:${third}:remove`,vertexTarget(third),`Click ${label(third)} again to remove only its set.`,2200,()=>api.select([a,b])));
      if(b!==undefined)add('basics',cue(`vertex:${b}`,vertexTarget(b),`Click ${label(b)} again. Only that choice is removed.`,2000,()=>api.select([a])));
      add('basics',cue('vertex-details','#vertex-detail-panel','Vertex details appear here, outside the graph.',1900,normal('details',{id:a})),
        cue('story-replay','#story-replay','Optional: press Show construction steps to illustrate this finite example. The complete open set is already shown.',4800,clickDemo('#story-replay')),
        cue('exact-sets','#sets-drawer > summary','Open this drawer to read the exact sets.',1400,normal('drawer',{id:'sets-drawer',open:true})),
        cue('complete','#story-complete','Complete selects every point required to make A open.',1900,normal('complete')));
    }
    add('basics',cue('clear-selection','[data-act="clearA"]','Clear selection removes your choices, keeping the graph.',1400,()=>act('clear')));
    add('edit',cue('preset-menu','#preset','The menu contains more graphs. Keep this one while we try the editing controls.',1600),
      cue('add-vertex','[data-tool="add-vertex"]','Add vertex: choose the tool, then an empty place.',1400,normal('tool',{value:'add-vertex'})),
      cue('new-vertex',pointTarget(()=>context.addPoint),'A click here creates a new isolated vertex.',2000,()=>{context.extra=act('add-vertex',{id:'d',...context.addPoint})||'d';},()=>{context.addPoint=edgePoint();}),
      cue('edit-drawer','#edit-drawer > summary','More editing and drawing controls are in this drawer.',1200,normal('drawer',{id:'edit-drawer',open:true})),
      cue('move','[data-tool="move"]','Move changes the drawing, not the topology.',1300,normal('tool',{value:'move'})),
      cue('drag-vertex',vertexTarget(()=>context.extra),'Hold the vertex, drag it smoothly, then release.',3000,null,()=>{const p=api.getState().graph.layout[context.extra];context.dragFrom={...p};context.dragTo={x:p.x+105,y:p.y-65};context.dragBox=api.viewport('capture');},'vertex-drag'),
      cue('add-edge','[data-tool="add-edge"]','Add edge connects two endpoints.',1200,normal('tool',{value:'add-edge'})),
      cue('edge-first:a',vertexTarget(a),'Choose the first endpoint.',1300,normal('edge-start',{id:a})),
      cue('edge-second:new',vertexTarget(()=>context.extra),'Choose the second. The edge appears and degrees update.',2000,()=>act('edge-finish',{id:context.extra})),
      cue('delete','[data-tool="delete"]','Delete removes a vertex and its attached edges.',1300,normal('tool',{value:'delete'})),
      cue('delete-vertex',vertexTarget(()=>context.extra),'Click the extra vertex to remove it. Undo can bring it back.',1700,()=>act('delete',{id:context.extra})));
    add('view',cue('zoom-in','#graph-zoom-in','Zoom in for a closer look.',1500,null,()=>api.setTool('select'),'zoom-in'),
      cue('zoom-out','#graph-zoom-out','Zoom out to see more around the graph.',1400,null,null,'zoom-out'),
      cue('fit','#graph-fit','Fit brings the complete graph back into view.',1100,()=>api.viewport('fit')),
      cue('pan','#graph-pan','Pan moves the view while the graph stays the same.',1200,()=>api.viewport('pan',{value:true})),
      cue('pan-drag',pointTarget(()=>context.panPoint),'Hold empty space and slide the whole view.',2200,null,()=>{
        const box=api.viewport('capture');context.panPoint={x:box.x+box.width*.32,y:box.y+box.height*.25};
      },'pan'),
      cue('pan-off','#graph-pan','Turn Pan off to select vertices again.',900,()=>api.viewport('pan',{value:false})),
      cue('expand','#graph-expand','Expand gives the graph more room.',1600,()=>api.viewport('expand',{value:true})),
      cue('collapse','#graph-expand','Close the expanded view to return.',1000,()=>api.viewport('expand',{value:false})),
      cue('layout','#layout-choice','Layouts rearrange the same graph. Watch the vertices move.',2700,null,()=>{
        act('drawer',{id:'edit-drawer',open:true});context.layoutFrom=capturePositions();context.layoutBox=api.viewport('capture');
        act('layout',{value:'circle'});context.layoutTo=capturePositions();for(const[id,p]of Object.entries(context.layoutFrom))api.dragVertex(id,p.x,p.y);api.viewport('set',{box:context.layoutBox});
      },'layout'),
      cue('strict','#mode','Strict uphill allows a step only to a higher degree.',1800,normal('mode',{value:'strict'})),
      cue('weak-patch','#mode','Weak patch keeps connected vertices of equal degree together.',1800,normal('mode',{value:'weak-patch'})),
      cue('uphill','#mode','Uphill also permits equal-degree steps.',1500,normal('mode',{value:'uphill'})),
      cue('arcs','#arcs','These are undirected edges. Hide the uphill-step arrows to see the underlying graph.',1400,normal('arcs',{value:false})),
      cue('theme','#theme-toggle','Choose the bright or dark colours you prefer.',1600,normal('theme',{value:'light'})));
    add('workbench',cue('workbench','#workspace-toggle','Full workbench opens the mathematical tools.',1700,normal('workspace',{value:'workbench'})),
      group('history','Undo and Redo move through your editing history.',2300,[family('undo','#undo','Undo restores the previous edit.',normal('undo')),family('redo','#redo','Redo applies that edit again.',normal('redo'))]),
      cue('workbench-example','#graph','Now use a temporary three-vertex path for the mathematical tools. Your own graph returns when the introduction ends.',2400,null,seedPath),
      cue('statistic','#stat','Count edge instances or distinct neighbours. Simple graphs give the same count.',1900,normal('statistic',{value:'distinct-neighbours'})),
      cue('class-labels','#ccol','Class labels identify vertices grouped together in the quotient.',1500,normal('class-labels',{value:false}),normal('drawer',{id:'edit-drawer',open:true})),
      cue('colour-mode','#colour-mode','Graph colours can instead show interior, boundary and exterior of A.',1900,normal('colour-mode',{value:'analysis'}),()=>api.select(['a'])),
      cue('neighbourhood-tool','[data-tool="neighbourhood"]','Explore a neighbourhood without replacing your selected set A.',1700,()=>{api.setTool('neighbourhood');act('trace',{id:'a'});}),
      cue('focus-tool','[data-tool="focus"]','Explain a vertex connects its membership to the inspector.',1500,()=>{act('tool',{value:'focus'});act('focus',{id:'a'});} ),
      cue('selection-list','#vlist [data-act="selv"]','These checkboxes are another way to choose A.',1500,clickDemo('#vlist [data-act="selv"]')), 
      group('set-operations','Apply an operation to your selected set.',6000,[
        family('interior','[data-op="interior"]','Interior keeps points whose neighbourhood stays inside A.',normal('operation',{value:'interior'}),()=>{seedPath();api.select(['a','c']);}),
        family('closure','[data-op="closure"]','Closure adds points whose neighbourhood meets A.',normal('operation',{value:'closure'}),()=>api.select(['b'])),
        family('boundary','[data-op="boundary"]','Boundary is closure minus interior.',normal('operation',{value:'boundary'}),()=>api.select(['b'])),
        family('complement','[data-op="complement"]','Complement selects the vertices outside A.',normal('operation',{value:'complement'}),()=>api.select(['a'])),
        family('enlarge','[data-op="enlarge"]','Complete to open adds all required vertices.',normal('operation',{value:'enlarge'}),()=>api.select(['a'])),
        family('saturate','[data-act="saturate"]','Saturation selects every vertex in each touched class.',clickDemo('[data-act="saturate"]'),()=>{act('preset',{id:'cycle4'});act('mode',{value:'uphill'});api.select(['a']);})]),
      group('witnesses','Witness buttons connect a mathematical claim to the graph.',2100,[
        family('show-arc','[data-act="show-arc"]','Highlight the step leaving A: its endpoint is missing.',clickDemo('[data-act="show-arc"]'),()=>{seedPath();api.select(['a']);}),
        family('show-path','[data-act="show-path"]','Highlight a path from an outside point into A.',clickDemo('[data-act="show-path"]'),()=>api.select(['b'])),
        {...family('clear-trace','[data-act="clear-trace"]','Clear highlight removes only the explanation.',clickDemo('[data-act="clear-trace"]'),normal('trace',{id:'a'})),requireVisible:true}]),
      cue('quotient-view','#qview','The quotient groups equivalent vertices. Choose direct arcs or covers.',1700,normal('quotient-view',{value:'condensation'})),
      group('quotient-controls','The quotient has its own zoom, pan, fit and expanded view.',5000,[
        {...family('quot-zoom-in','#quot-zoom-in','Zoom the quotient independently.'),motion:'quot-zoom-in'},
        {...family('quot-zoom-out','#quot-zoom-out','Zoom back out.'),motion:'quot-zoom-out'},
        family('quot-fit','#quot-fit','Fit shows every quotient class.',()=>api.viewport('fit',{id:'quot'})),
        family('quot-pan','#quot-pan','Pan also works in the quotient.',()=>api.viewport('pan',{id:'quot',value:true})),
        family('quot-expand','#quot-expand','Expand the quotient for a closer inspection.',()=>api.viewport('expand',{id:'quot',value:true}))]),
      cue('quot-close','#quot-expand','Close the expanded quotient to continue.',900,()=>{api.viewport('expand',{id:'quot',value:false});api.viewport('pan',{id:'quot',value:false});}));
    const tab=(value,text)=>cue(`tab-${value}`,`[data-tab="${value}"]`,text,1200,normal('tab',{value}));
    add('workbench',tab('opens','Open sets lists the topology: preview a set or use it as A.'),
      group('open-actions','List real open sets and try the listing controls.',4100,[
        family('enumerate','[data-act="enum"]','List open sets starts the calculation. This example stops after 32 sets.',normal('enumerate'),()=>act('enumeration-example',{count:10,limit:32})),
        {...family('enum-more','[data-act="enum-more"]','Continue increases the limit and lists more of the same topology.',clickDemo('[data-act="enum-more"]')),waitFor:true},
        {...family('enum-page','[data-act="enum-page"]:not(:disabled)','Next page shows the remaining loaded sets.',clickDemo('[data-act="enum-page"]:not(:disabled)')),waitFor:true},
        family('enum-page-back','[data-act="enum-page"][data-page="0"]','Previous page returns to the first loaded sets.',clickDemo('[data-act="enum-page"][data-page="0"]')),
        family('preview','[data-act="preview"]','Preview highlights this open set without changing A.',clickDemo('[data-act="preview"]')),
        family('useA','[data-act="useA"]','Use as A makes this listed set your selection.',clickDemo('[data-act="useA"]'))]),
      {...cue('enum-cancel-start','[data-act="enum"]','Start a larger listing to see the Cancel control.',1700,normal('enumerate',{paced:true}),()=>act('enumeration-example',{count:26,limit:100000})),pressAt:1400},
      {...cue('enum-cancel','[data-act="cancel-enum"]','Cancel stops a running calculation; loaded sets stay available.',1700,clickDemo('[data-act="cancel-enum"]')),pressAt:300,requireVisible:true},
      cue('listing-return','[data-tab="nbhd"]','Return to a small path to inspect its neighbourhoods.',1300,()=>{seedPath();act('enumeration-limits');act('tab',{value:'nbhd'});}),
      tab('nbhd','Minimal neighbourhoods connects exact sets to the drawings.'),
      group('neighbourhood-actions','Choose a set, class or relation to highlight it.',3100,[
        family('trace-nbhd','[data-act="trace-nbhd"]','A neighbourhood row highlights its full set.',clickDemo('[data-act="trace-nbhd"]')),
        family('trace-class','[data-act="trace-class"]','A class row highlights its vertices.',clickDemo('[data-act="trace-class"]')),
        family('trace-cover','[data-act="trace-cover"]','A cover highlights one step in the quotient.',clickDemo('[data-act="trace-cover"]')),
        family('trace-arc','[data-act="trace-arc"]','A direct relation highlights the corresponding arc.',clickDemo('[data-act="trace-arc"]'))]),
      tab('matrix','The relation matrix shows which vertices can reach which.'),
      cue('trace-relation','[data-act="trace-relation"]','Choose an entry to inspect that relation.',1100,clickDemo('[data-act="trace-relation"]')),
      tab('compare','Compare checks the same selection under different topologies.'),
      tab('subspace','Subspace compares a restricted topology with an induced graph.'),
      group('subspace-actions','Choose the carrier of the subspace.',3500,[
        family('sub-from-A','[data-act="sub-from-A"]','Use the selected set as the carrier.',normal('subspace',{value:'selection'})),
        family('sub-all','[data-act="sub-all"]','Use every vertex.',normal('subspace',{value:'all'})),
        family('sub-none','[data-act="sub-none"]','Start with the empty carrier.',normal('subspace',{value:'none'})),
        family('subv','[data-act="subv"]','Individual checkboxes refine the carrier.',clickDemo('[data-act="subv"]'))]),
      tab('poset','Poset tools generate a graph and check its finite certificate.'),
      group('poset-actions','Try a poset preset or enter your own points and arrows.',5800,[
        family('poset-crown','[data-p="crown"]','Load the four-point crown example.',clickDemo('[data-p="crown"]')),
        family('poset-chain','[data-p="chain6"]','Load a six-point chain.',clickDemo('[data-p="chain6"]')),
        family('poset-claw','[data-p="claw"]','Load one point below three others.',clickDemo('[data-p="claw"]')),
        family('poset-points','#pp','Enter the names of the ordered points.',setField('#pp','p q r')),family('poset-arrows','#pa','Enter p < q and q < r to describe a chain.',setField('#pa','p < q\nq < r')),
        family('poset-generate','[data-act="poset-gen"]','Generate constructs the graph and checks its finite certificate.',clickDemo('[data-act="poset-gen"]')),
        family('poset-load','[data-act="poset-load"]','Load graph brings the certified example into the workbench.',clickDemo('[data-act="poset-load"]'))]),
      cue('generated-result','#graph','The generated graph is now in the main view.',2000),
      tab('edit','Edit lists vertices, edges and text imports for precise changes.'),
      group('edit-actions','Try precise editing on a temporary three-vertex path.',9100,[
        family('rename','[data-act="rename"][data-v="a"]','Rename changes the label; the vertex ID remains a.',setField('[data-act="rename"][data-v="a"]','Alpha','change'),seedPath),
        family('selection-row','#tabbody [data-act="selv"][data-v="a"]','The row checkbox toggles this vertex in A.',clickDemo('#tabbody [data-act="selv"][data-v="a"]')),
        family('delete-row','[data-act="delv"][data-v="c"]','Delete removes c and its incident edge.',clickDemo('[data-act="delv"][data-v="c"]')),
        family('new-id','#newv','Give the new isolated vertex the ID d.',setField('#newv','d')),
        family('add-isolated','[data-act="addv"]','Add isolated vertex creates d without edges.',clickDemo('[data-act="addv"]')),
        family('edge-delete','[data-act="dele"]','Delete removes this edge instance.',clickDemo('[data-act="dele"]')),
        family('edge-from','#eu','Choose a as the first endpoint.',setField('#eu','a','change')),
        family('edge-to','#ev','Choose d as the second endpoint.',setField('#ev','d','change')),
        family('edge-connect','[data-act="adde"]','Connect creates the edge a—d.',clickDemo('[data-act="adde"]')),
        family('multigraph','[data-act="to-multi"]','Convert permits parallel edges between two different vertices.',clickDemo('[data-act="to-multi"]')),
        family('clear-graph','[data-act="clear-graph"]','Clear graph empties this temporary example. Undo can restore it.',clickDemo('[data-act="clear-graph"]')),
        family('edge-list','#el','Type two edges to build the path x—y—z.',setField('#el','x y\ny z')),
        family('isolates','#iso','Add w as a separate isolated vertex.',setField('#iso','w')),
        family('import-edges','[data-act="import-el"]','Replace graph builds the graph from those text fields.',clickDemo('[data-act="import-el"]')),
        family('graph-json','#gj','JSON can describe the whole graph. Here is a two-vertex example.',setField('#gj',JSON.stringify({kind:'simple-undirected',nodes:[{id:'p',label:'p'},{id:'q',label:'q'}],edges:[{id:'pq',source:'p',target:'q'}],layout:{p:{x:90,y:120},q:{x:260,y:120}}},null,2))),
        family('import-json-text','[data-act="import-json"]','Replace graph from JSON loads p—q from the text.',clickDemo('[data-act="import-json"]')),
        family('refresh-json','[data-act="refresh-json"]','Show current graph refreshes the JSON from the drawing.',clickDemo('[data-act="refresh-json"]'))]),
      tab('gallery','The gallery illustrates additional topology examples.'),
      group('gallery-actions','The finite exclusion field controls this gallery example.',1700,[family('gallery-F','#galF','Enter the finite excluded index set.',setField('#galF','1, 3, 5')),family('gallery-show','[data-act="galF"]','Show redraws that example.',clickDemo('[data-act="galF"]'))]),
      tab('help','Rules explains conventions and the meaning of each display.'),
      group('files','Save editable data and figures, or reopen an experiment.',6000,[
        family('import-json','.file-action','Import JSON restores saved data. This demo reopens an in-memory example, without a file picker.',()=>act('import-example')),
        family('export-json','#exp-json','Export JSON creates editable data. The tour previews it without downloading.',clickDemo('#exp-json')),
        family('export-report','#exp-html','Export report creates an offline HTML report. Here is a preview.',clickDemo('#exp-html')),
        family('export-graph','#exp-svg','Graph SVG creates an editable vector figure. Here is the actual output.',clickDemo('#exp-svg')),
        family('export-quotient','#exp-qsvg','Quotient SVG creates its editable vector figure. Here is the actual output.',clickDemo('#exp-qsvg'))]),
      cue('rules','#help','Rules is always available from the toolbar.',1200,normal('rules')),
      cue('visual-lessons','#open-lessons','Visual lessons opens illustrated scenes. Close returns to this introduction.',1600,()=>api.openLessons()),
      group('lesson-controls','The illustrated lessons have their own navigation.',6000,[
        family('lesson-pause','#intro-play','Pause freezes the illustrated scene.',clickDemo('#intro-play')),
        family('lesson-next','#intro-next','Next opens the following illustrated lesson.',clickDemo('#intro-next')),
        family('lesson-back','#intro-back','Back returns to the previous lesson.',clickDemo('#intro-back')),
        family('lesson-replay','#intro-replay','Replay restarts the visual lessons.',clickDemo('#intro-replay'))]),
      cue('visual-lessons-close','#intro-close','Close the lessons to return to the graph.',1300,()=>api.closeLessons?.()),
      cue('lesson-reopen','#open-lessons','Reopen the lessons and jump directly to a scene.',1300,()=>api.openLessons()),
      group('lesson-scenes','Each dot jumps to its illustrated scene.',6000,Array.from({length:6},(_,i)=>family(`lesson-scene-${i+1}`,`.intro-progress button:nth-child(${i+1})`,`Open illustrated scene ${i+1}.`,clickDemo(`.intro-progress button:nth-child(${i+1})`)))),
      cue('lesson-try','#intro-try','Try this graph loads the illustrated example into the main view.',1700,clickDemo('#intro-try')),
      cue('ready','#watch-guide','Your original graph returns now. Replay any chapter whenever you like.',1700));
    // Match the Direction Field demonstration: briefly identify a control,
    // act, then move on. Only an actual graph demonstration gets a longer beat.
    const demonstrations=new Set(['undirected-edges','colour-key','many-set-key','vertex-details',
      'story-replay','complete','new-vertex','edge-second:new','delete-vertex','picture-presets','picture-preset-current','workbench-example','generated-result']);
    const values={'preset-menu':primaryPreset||'',strict:'strict','weak-patch':'weak-patch',uphill:'uphill',statistic:'distinct-neighbours','colour-mode':'analysis','quotient-view':'condensation',layout:'circle'};
    const menuNames={preset:'graph',mode:'topology',stat:'degree statistic','layout-choice':'layout','colour-mode':'colour meaning',qview:'quotient view'};
    const browsedMenus=new Set();
    const menuSteps=step=>{
      const id=step.target?.selector?.replace?.(/^#/,'');
      if(!Object.hasOwn(menuNames,id))return[step];
      const button=query(`#${id}-menu-button`),value=values[step.key]??document.getElementById(id)?.value;
      const target=()=>{const option=api.menu('option',id,value);return option?.getClientRects().length&&!option.closest('[hidden]')?option:api.menu('button',id);};
      target.selector=()=>target()?.id?`#${target().id}`:`#${id}-menu-button`;
      const open={...cue(`${step.key}:menu-open`,button,`Open the ${menuNames[id]} list.`,1500,()=>api.menu('open',id),()=>{api.menu('close');api.fan('close');}),menuOpen:true};
      const choose={...step,target,action:()=>{step.action?.();api.menu('close');}};
      // Walk down the real opened list rather than parking on its button.
      // Do the complete preset catalogue in Edit, after the first vertex demo.
      const shouldBrowse=!browsedMenus.has(id)&&(id!=='preset'||step.key==='preset-menu');
      const browse=[];
      if(shouldBrowse){
        browsedMenus.add(id);
        const options=[...document.getElementById(id).options].filter(option=>!option.disabled&&!option.hidden&&!option.closest('optgroup')?.disabled&&!option.closest('optgroup')?.hidden);
        for(const option of options){
          const optionTarget=()=>api.menu('option',id,option.value);
          optionTarget.selector=()=>optionTarget()?.id?`#${optionTarget().id}`:'';
          browse.push({...cue(`${step.key}:menu-option:${option.value}`,optionTarget,option.textContent.trim(),1400,null,()=>{
            const element=optionTarget();element?.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse'}));
          }),menuBrowse:true});
        }
      }
      return[open,...browse,choose];
    };
    return Object.entries(chapters).flatMap(([chapter,list])=>list.flatMap(menuSteps).map(step=>{
      const duration=step.targets ? step.targets.length*(['set-operations','files'].includes(step.key)?2300:1500)
        : step.menuOpen ? 1500
        : step.menuBrowse ? 1400
        : step.motion || demonstrations.has(step.key) || step.key.startsWith('vertex:') ? step.duration
        : Math.max(1300,Math.min(1700,step.duration));
      return{...step,chapter,duration};
    }));
  }
  function clearFilePreview(){
    root.querySelector('.live-tour-file-preview')?.remove();
    delete root.dataset.filePreview;
  }
  window.addEventListener('uphill-tour-file-preview',event=>{
    if(!running)return;
    clearFilePreview();
    const {name,text,type}=event.detail||{},panel=document.createElement('section');
    panel.className='live-tour-file-preview';panel.setAttribute('aria-label','Generated file preview');
    const title=document.createElement('strong');title.textContent=`Preview · ${name}`;panel.append(title);
    const note=document.createElement('p');note.textContent=activeCue?.key==='import-json'?'This is example experiment data. Outside the introduction, Import JSON opens a file picker to load your saved experiment.':'This is the generated file. Outside the introduction, this button downloads it.';panel.append(note);
    if(type==='text/html'||type==='image/svg+xml'){
      const frame=document.createElement('iframe');frame.title=`Preview of ${name}`;frame.setAttribute('sandbox','');
      frame.srcdoc=type==='image/svg+xml'
        ? '<!doctype html><html><head><style>html,body{margin:0;height:100%;overflow:hidden}svg{display:block;width:100%!important;height:100%!important}</style></head><body>'+String(text)+'</body></html>'
        : String(text);
      panel.append(frame);
    }else{const code=document.createElement('pre');code.textContent=String(text);panel.append(code);}
    caption.after(panel);root.dataset.filePreview=JSON.stringify({name,type,bytes:new TextEncoder().encode(String(text)).length});scrollDirty=true;
  });
  function syncPlayback(){
    root.dataset.playing=String(playing);root.dataset.speed=String(speed);
    pauseButton.textContent=playing?'Ⅱ Pause':'▶ Continue';pauseButton.setAttribute('aria-label',playing?'Pause introduction':'Continue introduction');
    $('#live-tour-back').disabled=index<=0;$('#live-tour-next').disabled=index>=steps.length-1;
  }
  function geometry(element,point=null){
    if(!element||!element.isConnected||!element.getClientRects().length)return null;
    if(getComputedStyle(element).visibility==='hidden')return null;
    const source=element.matches('.vtx')?element.querySelector('.vertex-fill')||element:element,rect=source.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    if(point){const p=graphPoint(point);return p?{...p,left:p.x-14,top:p.y-14,width:28,height:28,vertex:true}:null;}
    return{x:rect.left+rect.width/2,y:rect.top+rect.height/2,left:rect.left,top:rect.top,width:rect.width,height:rect.height,vertex:element.matches('.vtx')};
  }
  function selectorOf(item){const selector=item.target?.selector;return typeof selector==='function'?selector():selector||'';}
  function clearFocus(){focusElement?.classList.remove('live-tour-control-focus');focusElement=null;}
  function currentBox(){return activeCue?geometry(activeCue.target?.(),activeCue.target?.graphPoint):null;}
  function visibleTarget(element,box){
    if(!box||box.x<1||box.x>window.innerWidth-1||box.y<1||box.y>window.innerHeight-1)return false;
    const captionBox=bar.getBoundingClientRect();
    if(box.x>=captionBox.left&&box.x<=captionBox.right&&box.y>=captionBox.top&&box.y<=captionBox.bottom)return false;
    for(let ancestor=activeCue.target?.graphPoint?element:element?.parentElement;ancestor&&ancestor!==document.body;ancestor=ancestor.parentElement){
      const css=getComputedStyle(ancestor),rect=ancestor.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(css.overflowY)&&(box.y<rect.top+ancestor.clientTop||box.y>rect.top+ancestor.clientTop+ancestor.clientHeight))return false;
      if(/auto|scroll|hidden|clip/.test(css.overflowX)&&(box.x<rect.left+ancestor.clientLeft||box.x>rect.left+ancestor.clientLeft+ancestor.clientWidth))return false;
    }
    return true;
  }
  function recordSkip(reason){
    if(skipped.some(item=>item.key===activeCue.key&&item.reason===reason))return;
    skipped.push({key:activeCue.key,selector:selectorOf(activeCue),reason});root.dataset.skipped=JSON.stringify(skipped);
  }
  function planScroll(){
    scrollDirty=false;let box=currentBox();if(!box)return;
    innerScrollTracks=[];
    // The sidebar, tables and expanded pane can scroll independently. Predict
    // their final target position before planning the surrounding page camera.
    for(let ancestor=activeCue.target?.()?.parentElement;ancestor&&ancestor!==document.body;ancestor=ancestor.parentElement){
      const css=getComputedStyle(ancestor),rect=ancestor.getBoundingClientRect();
      for(const[axis,overflow,size,total,start,centre,near,extent]of[
        ['y',css.overflowY,ancestor.clientHeight,ancestor.scrollHeight,ancestor.scrollTop,box.y,rect.top+ancestor.clientTop,box.height],
        ['x',css.overflowX,ancestor.clientWidth,ancestor.scrollWidth,ancestor.scrollLeft,box.x,rect.left+ancestor.clientLeft,box.width],
      ]){
        if(!/auto|scroll/.test(overflow)||total<=size+1||size<=0)continue;
        if(centre-extent/2>=near+10&&centre+extent/2<=near+size-10)continue;
        const to=clamp(start+centre-(near+size/2),0,total-size),difference=to-start;
        if(Math.abs(difference)<1)continue;
        innerScrollTracks.push({element:ancestor,axis,from:start,to,start:clockTime,duration:reduced.matches?240:400});
        box=axis==='y'?{...box,y:box.y-difference,top:box.top-difference}:{...box,x:box.x-difference,left:box.left-difference};
      }
    }
    const barRect=bar.getBoundingClientRect(),bottomBarTop=window.innerHeight-barRect.height-(window.innerWidth<=700?8:14);
    const covered=box.vertex||box.left+box.width>barRect.left-10,bottom=covered?bottomBarTop-25:window.innerHeight-35;
    if(box.vertex){
      const all=[...document.querySelectorAll('#graph .vtx')].map(el=>geometry(el)).filter(Boolean);
      if(all.length){const top=Math.min(...all.map(p=>p.top))-24,lower=Math.max(...all.map(p=>p.top+p.height))+24;if(lower-top<=bottom-55)box={...box,top,height:lower-top,y:(top+lower)/2};}
    }
    if(box.top>=55&&box.top+box.height<=bottom){bar.dataset.dock='bottom';return;}
    const max=Math.max(0,document.documentElement.scrollHeight-window.innerHeight),destination=clamp(window.scrollY+box.y-Math.max(90,(bottom+55)/2),0,max);
    // At the document end, scrolling cannot lift a low right-hand control out
    // of the caption. Dock the caption above it instead of hiding the control.
    const afterBottom=box.top+box.height-(destination-window.scrollY);
    bar.dataset.dock=covered&&afterBottom>bottomBarTop-12?'top':'bottom';
    // One paused, speed-scaled clock drives camera, cursor, arrows and graph.
    scrollTrack={from:window.scrollY,to:destination,start:clockTime,duration:reduced.matches?240:550};
  }
  function advanceScroll(){
    if(scrollDirty)planScroll();
    innerScrollTracks=innerScrollTracks.filter(track=>{
      if(!track.element.isConnected)return false;
      const fraction=ease((clockTime-track.start)/track.duration),value=mix(track.from,track.to,fraction);
      if(track.axis==='y')track.element.scrollTop=value;else track.element.scrollLeft=value;
      return fraction<1;
    });
    if(!scrollTrack)return;
    const fraction=ease((clockTime-scrollTrack.start)/scrollTrack.duration);
    window.scrollTo({top:mix(scrollTrack.from,scrollTrack.to,fraction),behavior:'instant'});if(fraction>=1)scrollTrack=null;
  }
  function enterSegment(next,replaying=false){
    const step=steps[index];segment=next;const entries=step.targets||[step];activeCue=entries[next];if(!activeCue)return;
    segmentStart=step.duration/entries.length*next;actionDone=false;visibleActionFrames=0;visibleActionSince=null;actionAt=null;segmentReplaying=replaying;motionData=null;cursorFrom=cursorAt;blinkSettledAt=null;clearFocus();
    root.dataset.target=activeCue.key;root.dataset.targetSelector=selectorOf(activeCue);root.dataset.segment=String(segment);root.dataset.targetVisible='false';
    clearFilePreview();api.help?.('hide');
    helpReadingRemaining=0;helpReadingDone=false;helpReadingIdentity=null;syncReading();
    caption.textContent=activeCue.text||step.text;activeCue.enter?.();
    const motion=activeCue.motion?.replace('quot-','');
    if(motion?.startsWith('zoom')||motion==='pan'){
      const id=activeCue.motion.startsWith('quot-')?'quot':'graph',from=api.viewport('capture',{id});
      if(from){const factor=motion==='zoom-in'?.74:motion==='zoom-out'?1.22:1;
        const to={x:from.x+from.width*(1-factor)/2,y:from.y+from.height*(1-factor)/2,width:from.width*factor,height:from.height*factor};
        if(motion==='pan'){to.x-=from.width*.15;to.y-=from.height*.09;}motionData={from,to,id,screen:null};}
    }
    const element=activeCue.target?.();
    if((!element||!geometry(element,activeCue.target?.graphPoint))&&!activeCue.waitFor)recordSkip('absent-or-hidden');else if(element?.disabled)recordSkip('disabled');
    if(!replaying)scrollDirty=true;
  }
  function sampleMotion(item,fraction){
    if(item.motion==='vertex-drag'&&context.dragFrom){const p=pointMix(context.dragFrom,context.dragTo,fraction);api.dragVertex(context.extra,p.x,p.y);api.viewport('set',{box:context.dragBox});}
    else if(item.motion==='layout'&&context.layoutFrom){
      for(const[id,from]of Object.entries(context.layoutFrom)){const to=context.layoutTo[id];if(!to)continue;const p=pointMix(from,to,fraction);api.dragVertex(id,p.x,p.y);}api.viewport('set',{box:context.layoutBox});
    }else if(motionData?.from){const box=Object.fromEntries(['x','y','width','height'].map(key=>[key,mix(motionData.from[key],motionData.to[key],fraction)]));api.viewport('set',{id:motionData.id,box});}
  }
  function applyAction(){
    if(actionDone||!activeCue)return;actionDone=true;
    const element=activeCue.target?.();
    if(activeCue.requireVisible&&!segmentReplaying&&element&&(visibleActionFrames<2||visibleActionSince===null||performance.now()-visibleActionSince<300)){actionDone=false;return;}
    if(!element||!geometry(element,activeCue.target?.graphPoint)){if(activeCue.waitFor){actionDone=false;return;}recordSkip('absent-or-hidden');return;}
    if(element.disabled){recordSkip('disabled');return;}
    actionAt=elapsed-segmentStart;activeCue.action?.();scrollDirty=true;root.dataset.lastAction=activeCue.key;
  }
  function enterStep(next,replaying=false){
    if(!running)return;if(next>=steps.length){stop('complete');return;}
    api.stopWave();index=next;elapsed=0;segment=-1;const step=steps[index];root.dataset.step=String(index);root.dataset.chapter=step.chapter;
    if(step.targets)step.enter?.();enterSegment(0,replaying);
    chapterButtons.forEach(button=>button.setAttribute('aria-current',button.dataset.liveChapter===step.chapter?'step':'false'));
    $('.live-tour-count').textContent=`${index+1} / ${steps.length}`;syncPlayback();
  }
  function finishCurrent(){const entries=steps[index].targets||[steps[index]];for(let n=segment;n<entries.length;n++){if(n!==segment)enterSegment(n,true);applyAction();if(activeCue.motion)sampleMotion(activeCue,1);}}
  function seek(next){
    if(!running)return;const wanted=clamp(next,0,steps.length-1),priorPlaying=playing;
    api.stopWave();clearFocus();scrollTrack=null;innerScrollTracks=[];api.resetDemo();context={extra:'d',addPoint:null};
    // Reconstruct only the temporary preview. The original capture is retained
    // by the adapter until completion or the user's first real gesture.
    for(let n=0;n<wanted;n++){enterStep(n,true);finishCurrent();}
    enterStep(wanted);playing=priorPlaying;previousTime=performance.now();syncPlayback();
  }
  function draw(delta){
    if(!activeCue)return;advanceScroll();
    const total=steps.reduce((sum,item)=>sum+item.duration,0),done=steps.slice(0,index).reduce((sum,item)=>sum+item.duration,0)+elapsed,progress=Math.min(1,done/total);
    root.dataset.progress=String(progress);
    // Duration is an upper estimate in speed-scaled milliseconds. Reading
    // pauses use real foreground time, including when playback is faster.
    const readingBudget=steps.reduce((sum,item)=>sum+(item.targets?.length||1),0)*helpReadingDuration;
    root.dataset.duration=String(total+readingBudget*speed);root.dataset.readingBudgetMs=String(readingBudget);
    $('.live-tour-progress span').style.width=`${progress*100}%`;
    const box=currentBox();
    if(!box){root.dataset.targetVisible='false';halo.style.display=arrow.style.display=clickRing.style.display=cursor.style.display='none';return;}
    root.dataset.targetSelector=selectorOf(activeCue);
    const element=activeCue.target?.();if(element!==focusElement){clearFocus();if(!box.vertex&&element){focusElement=element;focusElement.classList.add('live-tour-control-focus');}}
    root.dataset.targetVisible=String(visibleTarget(element,box));
    if(root.dataset.targetVisible==='true'){coverage.add(activeCue.key);root.dataset.covered=JSON.stringify([...coverage]);}
    const step=steps[index],segmentDuration=step.duration/(step.targets?.length||1),age=elapsed-segmentStart;
    const pressAt=activeCue.pressAt??Math.min(650,segmentDuration*.58),approach=Math.min(450,pressAt,segmentDuration*.48);
    halo.style.display=box.vertex?'none':'';arrow.style.display='';cursor.style.display='';const pad=6;
    // Point once, then let the viewer watch the result. Keep a held cursor
    // visible during real drag/zoom/layout motion; never fake movement to fill time.
    if(age>=approach&&element&&!box.vertex&&root.dataset.targetVisible==='true'){
      api.help?.('show',element);
      const popup=readingPopup();
      if(popup&&!helpReadingDone&&!segmentReplaying){
        const identity=popup.dataset.helpKey+'\n'+popup.textContent;
        if(identity!==helpReadingIdentity){helpReadingIdentity=identity;helpReadingRemaining=helpReadingDuration;syncReading();}
      }
    }
    const pointerAge=activeCue.requireVisible&&actionAt!==null?age-actionAt+700:age;
    const pointerOpacity=activeCue.requireVisible&&!actionDone?1:1-clamp((pointerAge-1100)/200);
    arrow.style.opacity=String(pointerOpacity);
    cursor.style.opacity=String(activeCue.motion?1:pointerOpacity);
    for(const[key,value]of Object.entries({x:box.left-pad,y:box.top-pad,width:box.width+pad*2,height:box.height+pad*2}))halo.setAttribute(key,String(value));
    halo.setAttribute('opacity',String(.45+.3*(1+Math.sin(clockTime/750*Math.PI*2))/2));
    const end={x:box.vertex?box.x-15:box.x,y:box.top-8},start={x:clamp(end.x-80,20,window.innerWidth-20),y:Math.max(15,end.y-60)};
    arrow.setAttribute('d',`M${start.x},${start.y} Q${end.x-48},${start.y-9} ${end.x},${end.y}`);
    const length=arrow.getTotalLength(),drawFraction=clamp(age/Math.min(400,segmentDuration*.32));arrow.style.strokeDasharray=String(length);arrow.style.strokeDashoffset=String(length*(1-ease(drawFraction)));
    if(drawFraction>.82)arrow.setAttribute('marker-end','url(#live-tour-arrowhead)');else arrow.removeAttribute('marker-end');
    const motionFraction=ease((age-pressAt)/Math.max(1,segmentDuration-pressAt-300));let destination={x:box.x,y:box.y};
    if(activeCue.motion==='pan'&&motionData&&age>=pressAt){
      const matrix=document.querySelector('#graph svg')?.getScreenCTM();
      const dx=matrix?-(motionData.to.x-motionData.from.x)*matrix.a:0,dy=matrix?-(motionData.to.y-motionData.from.y)*matrix.d:0;
      // The held pointer and the graph travel by the same screen displacement.
      // Capture after the camera approaches, not while the page is scrolling.
      motionData.screen||={x:box.x-dx*motionFraction,y:box.y-dy*motionFraction};
      destination={x:motionData.screen.x+dx*motionFraction,y:motionData.screen.y+dy*motionFraction};
    }
    const from=cursorFrom||{x:clamp(box.x+65,25,window.innerWidth-30),y:clamp(box.y+45,25,window.innerHeight-30)};
    if(age<approach)cursorAt=pointMix(from,destination,ease(age/approach));
    else if(activeCue.motion==='vertex-drag'||activeCue.motion==='pan')cursorAt=destination;
    else cursorAt=cursorAt?pointMix(cursorAt,destination,playing?1-Math.exp(-Math.max(0,delta)/85):0):destination;
    cursor.style.left=`${cursorAt.x-4}px`;cursor.style.top=`${cursorAt.y-2}px`;
    const clickAge=age-(activeCue.requireVisible?(actionAt??Infinity):pressAt),holding=Boolean(activeCue.motion)&&clickAge>=0&&motionFraction<1,clicking=Boolean(activeCue.action||activeCue.motion)&&clickAge>=0&&clickAge<420;
    clickRing.style.display=clicking&&!reduced.matches?'':'none';
    if(clicking){clickRing.setAttribute('cx',String(destination.x));clickRing.setAttribute('cy',String(destination.y));clickRing.setAttribute('r',String(9+clickAge/420*23));clickRing.setAttribute('opacity',String(1-clickAge/420));}
    cursor.style.transform=holding||clicking&&clickAge<140?'scale(.85)':'';
    if(activeCue.requireVisible&&!actionDone){
      const presented=root.dataset.targetVisible==='true'&&Math.hypot(cursorAt.x-box.x,cursorAt.y-box.y)<14;
      visibleActionFrames=presented?visibleActionFrames+1:0;
      if(presented)visibleActionSince??=performance.now();else visibleActionSince=null;
      root.dataset.actionVisibleFrames=String(visibleActionFrames);
    }
    root.dataset.cursor=JSON.stringify(cursorAt);root.dataset.scroll=String(window.scrollY);root.dataset.motion=activeCue.motion||'';
  }
  function readingPopup(){
    const popup=document.getElementById('control-help-popover'),element=activeCue?.target?.();
    if(!popup||popup.hidden||popup.dataset.source!=='tour'||!element?.dataset.helpToken||popup.dataset.helpFor!==element.dataset.helpToken)return null;
    const rect=popup.getBoundingClientRect();
    return rect.width>0&&rect.height>0&&root.dataset.targetVisible==='true'?popup:null;
  }
  function syncReading(){
    root.dataset.reading=String(helpReadingRemaining>0);
    root.dataset.readingRemainingMs=String(helpReadingRemaining);
  }
  function tick(now,token){
    if(!running||token!==generation)return;
    const foregroundDelta=playing&&!document.hidden?Math.min(80,Math.max(0,now-previousTime)):0;previousTime=now;
    const reading=helpReadingRemaining>0;
    const repositioning=reading&&(scrollDirty||scrollTrack||innerScrollTracks.length>0);
    if(reading&&!repositioning&&readingPopup()){
      helpReadingRemaining=Math.max(0,helpReadingRemaining-foregroundDelta);
      if(helpReadingRemaining===0)helpReadingDone=true;
      syncReading();
    }
    // Freeze the cue, camera, cursor, action and grouped-control transitions
    // together. Pause or a hidden tab must not spend the user's reading time.
    const delta=reading?0:foregroundDelta*speed;
    // A resize may move the explained control offscreen. Let its camera settle
    // before counting reading time, without advancing the cue or its action.
    const cameraDelta=repositioning?foregroundDelta*speed:delta;
    elapsed+=delta;clockTime+=cameraDelta;const step=steps[index];
    if(step&&playing&&!reading){
      const segmentDuration=step.duration/(step.targets?.length||1),targetSegment=Math.min((step.targets?.length||1)-1,Math.floor(elapsed/segmentDuration));
      if(targetSegment!==segment){applyAction();if(activeCue.motion)sampleMotion(activeCue,1);enterSegment(targetSegment);}
      const age=elapsed-segmentStart,pressAt=activeCue.pressAt??Math.min(650,segmentDuration*.58);if(age>=pressAt)applyAction();
      if(activeCue.motion&&age>=pressAt)sampleMotion(activeCue,ease((age-pressAt)/Math.max(1,segmentDuration-pressAt-300)));
      if(elapsed>=step.duration){
        const blinkRunning=activeCue.waitForBlink&&document.getElementById('graph')?.dataset.blinkPlaying==='true';
        if(activeCue.waitForBlink&&!blinkRunning)blinkSettledAt??=now;
        if(blinkRunning){blinkSettledAt=null;/* Finish all three gentle blinks, including at a faster tour speed. */}
        else if(activeCue.waitForBlink&&now-blinkSettledAt<250){/* Let the complete static colours settle before moving on. */}
        else if(activeCue.requireVisible&&(!actionDone||actionAt!==null&&elapsed-segmentStart-actionAt<400)){/* Let the visible click and result settle. */}
        else {finishCurrent();enterStep(index+1);}
      }
    }
    if(!running||token!==generation)return;draw(cameraDelta);frame=requestAnimationFrame(time=>tick(time,token));
  }
  function stop(reason='skip'){
    clearTimeout(autoStart);autoStart=null;if(!running)return;
    running=playing=false;generation++;cancelAnimationFrame(frame);frame=null;clearFocus();clearFilePreview();api.help?.('hide');api.closeLessons?.();scrollTrack=null;innerScrollTracks=[];
    helpReadingRemaining=0;helpReadingDone=false;helpReadingIdentity=null;syncReading();
    root.hidden=true;root.dataset.active='false';root.dataset.playing='false';root.dataset.stopReason=reason;root.dataset.target='';
    api.stopWave();api.restore();
    if(originalScroll&&reason!=='user-input'&&reason!=='escape')window.scrollTo({left:originalScroll.x,top:originalScroll.y,behavior:'instant'});originalScroll=null;
  }
  function start(){
    stop('replay');clearTimeout(autoStart);originalScroll={x:window.scrollX,y:window.scrollY};api.begin();
    running=playing=true;generation++;coverage=new Set();skipped=[];root.dataset.covered='[]';root.dataset.skipped='[]';steps=buildSteps();
    cursorAt=cursorFrom=null;scrollTrack=null;innerScrollTracks=[];clockTime=0;bar.dataset.dock='bottom';root.hidden=false;root.dataset.active='true';delete root.dataset.stopReason;
    enterStep(0);previousTime=performance.now();draw(0);const token=generation;frame=requestAnimationFrame(time=>tick(time,token));
  }
  function interrupt(event){
    const targetElement=event.target instanceof Element?event.target:null;
    if(targetElement?.closest('[data-control-help-trigger],#control-help-popover')){
      const question=targetElement.closest('[data-control-help-trigger]');
      const asking=event.isTrusted&&question&&(event.type==='pointerdown'||event.type==='keydown'&&['Enter',' '].includes(event.key));
      // A real request for help needs reading time. Freeze the same preview
      // just as Pause does; Continue resumes this cue without restarting it.
      if(asking&&running&&playing){
        playing=false;if(api.pauseWave)api.pauseWave();else api.stopWave();
        previousTime=performance.now();syncPlayback();
      }
      return;
    }
    if(targetElement?.closest('#live-tour .live-tour-bar')){if(event.type==='keydown'&&event.key==='Escape')stop('escape');return;}
    // Window capture runs before viewport document handlers, including Pan and
    // expanded-view Escape handlers that stop event propagation.
    const button=targetElement?.closest('button');
    if(running&&event.type==='pointerdown'&&button&&event.button===0){try{button.setPointerCapture(event.pointerId);}catch{/* Unsupported capture still permits interruption. */}}
    const menuId=event.type==='pointerdown'?targetElement?.closest('[data-menu-id][data-menu-value]')?.dataset.menuId:null;
    clearTimeout(autoStart);autoStart=null;if(running){stop(event.type==='keydown'&&event.key==='Escape'?'escape':'user-input');if(menuId)api.menu('open',menuId);}
  }
  window.addEventListener('pointerdown',interrupt,true);window.addEventListener('keydown',interrupt,true);
  window.addEventListener('wheel',interrupt,{capture:true,passive:true});window.addEventListener('touchstart',interrupt,{capture:true,passive:true});
  pauseButton.addEventListener('click',()=>{
    if(!running)return;playing=!playing;
    if(playing&&document.getElementById('control-help-popover')?.dataset.source==='question')api.help?.('hide');
    if(playing)api.resumeWave?.();else if(api.pauseWave)api.pauseWave();else api.stopWave();
    previousTime=performance.now();syncPlayback();
  });
  $('#live-tour-back').addEventListener('click',()=>seek(index-1));$('#live-tour-next').addEventListener('click',()=>seek(index+1));
  $('#live-tour-speed').addEventListener('change',event=>{speed=Number(event.target.value)||defaultSpeed;previousTime=performance.now();syncPlayback();});
  $('#live-tour-replay').addEventListener('click',start);$('#live-tour-skip').addEventListener('click',()=>stop('skip'));
  for(const button of chapterButtons)button.addEventListener('click',()=>seek(steps.findIndex(step=>step.chapter===button.dataset.liveChapter)));
  document.querySelector('#watch-guide')?.addEventListener('click',start);window.addEventListener('resize',()=>{if(running)scrollDirty=true;});
  autoStart=window.setTimeout(start,700);return{start,stop,isRunning:()=>running};
}
