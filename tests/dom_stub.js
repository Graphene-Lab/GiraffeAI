// Small DOM fixture for the dependency-free chat tests. It tracks element identity
// and parses rendered markup so tests exercise updates to real child relationships.
function makeEl(id='',tagName='div') {
    const el={id,tagName,className:'',value:'',checked:false,style:{},disabled:false,placeholder:'',rows:0,
        children:[],parentNode:null,scrollHeight:0,scrollTop:0,htmlWrites:0,
        classList:{toggle(){}},focus(){},addEventListener(){},
        setAttribute(name,value){this[name]=String(value)},
        appendChild(child){return this.insertBefore(child,null)},
        insertBefore(child,reference){
            if(child.parentNode)child.remove();
            const index=reference?this.children.indexOf(reference):this.children.length;
            if(index<0)throw new Error('Reference is not a child');
            this.children.splice(index,0,child);child.parentNode=this;return child
        },
        replaceChildren(...children){this.children.forEach(child=>{child.parentNode=null});this.children=[];children.forEach(child=>this.appendChild(child))},
        remove(){if(this.parentNode){const parent=this.parentNode;parent.children.splice(parent.children.indexOf(this),1);this.parentNode=null}},
        querySelector(selector){return this.querySelectorAll(selector)[0]||null},
        querySelectorAll(selector){
            const matches=[];
            const visit=node=>{for(const child of node.children){
                if(selector.startsWith('.')?child.className.split(/\s+/).includes(selector.slice(1)):child.tagName===selector)matches.push(child);
                visit(child)
            }};
            visit(this);return matches
        },
        get firstElementChild(){return this.children[0]||null},
        get lastElementChild(){return this.children.at(-1)||null},
        get innerHTML(){return this._html||''},
        set innerHTML(value){
            this.htmlWrites++;this._html=String(value);this.replaceChildren();
            const stack=[this];
            for(const token of this._html.matchAll(/<\/?[a-zA-Z][^>]*>/g)){
                const markup=token[0];
                if(markup.startsWith('</')){if(stack.length>1)stack.pop();continue}
                const tag=markup.match(/^<([^\s/>]+)/)[1];
                const child=makeEl('',tag);
                child.className=markup.match(/class="([^"]*)"/)?.[1]||'';
                child.open=/\sopen(?:\s|>|\/)/.test(markup);
                stack.at(-1).appendChild(child);
                if(!markup.endsWith('/>')&&!['br','hr','input','img','meta','link'].includes(tag))stack.push(child)
            }
        },
        get textContent(){return this._text||''},
        set textContent(value){
            this._text=value==null?'':String(value);
            this.innerHTML=this._text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
        }
    };
    return el
}
module.exports={makeEl};
