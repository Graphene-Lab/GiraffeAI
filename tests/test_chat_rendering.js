// Regression checks for streamed chat rendering, using the same isolated page
// fixture as the attachment suite. No provider calls or saved user data are used.
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
let fixture=fs.readFileSync(path.join(__dirname,'test_attachments.js'),'utf8').split('let pass = 0, fail = 0;')[0];
fixture=fixture.replace('window.__internals={isTextualFile','window.__internals={sendWithFiles,rMsgs,setLanguage:(language)=>{cl=language;cli=L.indexOf(language)},isTextualFile');
const {I,sandbox,elements}=new Function('require','__dirname',fixture+'\nreturn {I,sandbox,elements};')(require,__dirname);
sandbox.URL=class extends URL {static createObjectURL(){return 'blob:stub'}static revokeObjectURL(){}};
let checks=0;
function check(name,run){run();checks++;console.log('  OK   '+name)}
function setup(format='openai'){
    const ch={id:'c',title:'Test',createdAt:1,messages:[{role:'user',content:'Old prompt'},{role:'assistant',content:'Old answer'}]};
    const state={providers:[{id:'p',name:'Mock',format,model:'mock',endpoint:'/v1/chat/completions'}],activeProviderId:'p',activeChatId:'c',chats:{p:{c:ch}},settings:{},theme:'dark',language:'en',totalTokens:0};
    I.setD(state);I.rMsgs();
    return {state,ch,root:elements.chatMessages}
}
function openai(delta){return 'data: '+JSON.stringify({choices:[{delta}]})+'\n\n'}
async function streamCase(format,chunks){
    const {ch,root}=setup(format);
    const oldNodes=[...root.children],writes=root.htmlWrites;
    const snapshots=[];
    let requests=0,saves=0,frames=0,assistantNode;
    sandbox.localStorage.setItem=()=>{saves++};
    sandbox.requestAnimationFrame=()=>{frames++};
    sandbox.fetch=async()=>{
        requests++;assistantNode=root.lastElementChild;
        check(format+': waiting indicator before first token',()=>assert(assistantNode.querySelector('.message-loading')));
        return {ok:true,body:{getReader(){let index=0;return {async read(){
            snapshots.push({node:root.lastElementChild,bodyWrites:assistantNode.querySelector('.message-content').htmlWrites,frames,saves});
            if(index===chunks.length)return {done:true};
            return {done:false,value:new TextEncoder().encode(chunks[index++])}
        }}}}}
    };
    await I.sendWithFiles('New prompt',[]);
    check(format+': one provider request',()=>assert.equal(requests,1));
    check(format+': old message nodes stay in place',()=>oldNodes.forEach((node,i)=>assert.equal(root.children[i],node)));
    check(format+': no whole-list HTML replacements',()=>assert.equal(root.htmlWrites,writes));
    check(format+': assistant row survives every chunk and completion',()=>{snapshots.forEach(s=>assert.equal(s.node,assistantNode));assert.equal(root.lastElementChild,assistantNode)});
    check(format+': role-only event causes no redraw or save',()=>assert.deepEqual(snapshots[1],snapshots[0]));
    check(format+': heartbeat causes no redraw or save',()=>assert.deepEqual(snapshots[3],snapshots[2]));
    check(format+': final event causes no redraw or save',()=>assert.deepEqual(snapshots[5],snapshots[4]));
    check(format+': streamed answer remains correct',()=>assert.equal(ch.messages.at(-1).content,'Hello world'));
    check(format+': waiting indicator removed after text',()=>assert.equal(assistantNode.querySelector('.message-loading'),null));
}
(async()=>{
    for(const [format,hostname,port,endpoint] of [
        ['openai','localhost','8000','http://127.0.0.1:5291/v1/chat/completions'],
        ['ollama','localhost','8000','http://localhost:5291/v1/chat/completions'],
        ['anthropic','localhost','8000','http://127.0.0.1:5291/v1/messages'],
        ['openai','localhost','8000','http://127.0.0.1:8787/v1/chat/completions'],
        ['openai','localhost','8000','http://localhost:8000/v1/chat/completions'],
        ['openai','','','http://127.0.0.1:5291/v1/chat/completions'],
        ['openai','localhost','8000','/v1/chat/completions']
    ]){
        const {state}=setup(format);state.providers[0].endpoint=endpoint;
        sandbox.location.hostname=hostname;sandbox.location.port=port;
        let requested;
        sandbox.fetch=async url=>{requested=url;return {ok:true,body:{getReader:()=>({read:async()=>({done:true})})}}};
        await I.sendWithFiles('Check endpoint',[]);
        check(format+': respects saved endpoint '+endpoint+' from '+(port||'file page'),()=>assert.equal(requested,endpoint));
    }
    sandbox.location.hostname='localhost';sandbox.location.port='8000';
    await streamCase('openai',[openai({role:'assistant'}),openai({content:'Hello'}),': ping\n\n',openai({content:' world'}),'data: [DONE]\n\n']);
    await streamCase('ollama',['{"message":{"role":"assistant"}}\n','{"message":{"content":"Hello"}}\n','\n','{"message":{"content":" world"}}\n','{"done":true}\n']);
    await streamCase('anthropic',['event: message_start\n\n','data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',': ping\n\n','data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}\n\n','data: {"type":"message_stop"}\n\n']);
    await streamCase('gemini',['data: {}\n\n','data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n',': ping\n\n','data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}\n\n','data: [DONE]\n\n']);

    const {state,ch,root}=setup();
    const first=root.firstElementChild;
    const am=ch.messages[1];
    am.thinking='Reasoning';am.thinkingExpanded=true;I.rMsgs();
    root.lastElementChild.querySelector('.thinking-block').open=false;
    am.thinking+=' continues';I.rMsgs();
    check('collapsed reasoning stays collapsed during streaming',()=>assert.equal(root.lastElementChild.querySelector('.thinking-block').open,false));
    let urls=0;sandbox.URL.createObjectURL=()=>{urls++;return 'blob:'+urls};
    am.attachments=[{resource:{uri:'report.txt',text:'report'}}];I.rMsgs();
    am.content+=' updated';I.rMsgs();
    check('attachment URL is reused while text changes',()=>assert.equal(urls,1));
    const assistant=root.lastElementChild;
    I.setLanguage('it');I.rMsgs();
    check('language change updates actions without replacing rows',()=>{assert.equal(root.lastElementChild,assistant);assert(assistant.querySelector('.message-actions').innerHTML.includes('Copia'))});
    I.setLanguage('en');
    ch.messages=ch.messages.slice(0,1);I.rMsgs();
    check('regeneration removes only the obsolete tail',()=>{assert.equal(root.children.length,1);assert.equal(root.firstElementChild,first)});
    state.chats.p.empty={id:'empty',messages:[]};state.activeChatId='empty';I.rMsgs();
    state.activeChatId='c';I.rMsgs();
    check('switching back from an empty chat restores cached rows',()=>{assert.equal(root.children.length,1);assert.equal(root.firstElementChild,first)});

    for(const outcome of ['error','abort']){
        const {ch,root}=setup();
        sandbox.fetch=async()=>{throw Object.assign(new Error('Test failure'),{name:outcome==='abort'?'AbortError':'Error'})};
        await I.sendWithFiles('New prompt',[]);
        check(outcome+': waiting indicator cleared',()=>assert.equal(root.lastElementChild.querySelector('.message-loading'),null));
        check(outcome+': outcome remains visible',()=>assert.match(ch.messages.at(-1).content,outcome==='abort'?/Generation stopped/:/Test failure/));
    }
    console.log('\n'+checks+' chat rendering checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
