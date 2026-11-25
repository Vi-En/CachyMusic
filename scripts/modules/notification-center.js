// Bounded, recoverable in-app notices. Never require reading a toast to operate the player.
export function createNotificationCenter({doc = document, schedule = setTimeout, cancel = clearTimeout} = {}) {
    const entries = [];
    const view = doc.defaultView;
    let observer = null, modalObserver = null;
    const activeModal=()=>[...doc.querySelectorAll('[role="dialog"][aria-modal="true"], dialog[open]')].filter(el=>el.getClientRects().length).at(-1)||null;
    const modalOpen=()=>Boolean(activeModal());
    let modalNotice=null;
    function inlineModalMessage(message){const modal=activeModal();if(!modal)return;const target=modal.querySelector('.modalCard')||modal;if(!modalNotice||!target.contains(modalNotice)){modalNotice?.remove();modalNotice=doc.createElement('p');modalNotice.className='modalInlineNotice';modalNotice.setAttribute('role','status');target.append(modalNotice);}modalNotice.textContent=message;}
    function syncModal(){const hidden=modalOpen();if(modalNotice&&(!hidden||!activeModal().contains(modalNotice))){modalNotice.remove();modalNotice=null;}if(!entries.length&&!modalNotice)stopPosition();const container=doc.getElementById('cachyToastContainer');if(container)container.hidden=hidden;for(const e of entries){if(hidden)pause(e);else arm(e);}}
    function position() {
        const container = doc.getElementById('cachyToastContainer');
        if (!container || !view) return;
        const docks = [doc.getElementById('persistentMiniPlayer'),doc.querySelector('.mobileTabBar')];
        const top = Math.min(view.innerHeight, ...docks.filter(el=>el?.getClientRects().length).map(el=>el.getBoundingClientRect().top));
        container.style.setProperty('--toast-bottom', `${Math.max(12,view.innerHeight-top+8)}px`);
    }
    function watchPosition() {
        if ((!entries.length&&!modalNotice) || !view || modalObserver || observer) return;
        position();
        if(view.MutationObserver){modalObserver=new view.MutationObserver(syncModal);for(const el of doc.querySelectorAll('[role="dialog"][aria-modal="true"], dialog'))modalObserver.observe(el,{attributes:true,attributeFilter:['style','class','hidden','open']});}
        view.addEventListener('resize',position);
        if (view.ResizeObserver) {
            observer = new view.ResizeObserver(position);
            for (const el of [doc.getElementById('persistentMiniPlayer'),doc.querySelector('.mobileTabBar')]) if(el) observer.observe(el);
        }
    }
    function stopPosition() {
        observer?.disconnect();observer=null;modalObserver?.disconnect();modalObserver=null;
        view?.removeEventListener('resize',position);
    }
    const priority = entry => entry.action ? 3 : entry.level === 'error' ? 2 : entry.level === 'warning' ? 1 : 0;
    function remove(entry, restoreFocus = false) {
        const index = entries.indexOf(entry);
        if (index < 0) return;
        cancel(entry.timer); entries.splice(index, 1);
        const focused = entry.element.contains(doc.activeElement);
        entry.element.remove();
        if(!entries.length&&!modalNotice) stopPosition();
        if (restoreFocus && focused && entry.origin?.isConnected) entry.origin.focus({preventScroll:true});
    }
    function pause(entry) { cancel(entry.timer); entry.timer = null; }
    function arm(entry) {
        pause(entry);
        if (entry.hover || entry.element.contains(doc.activeElement) || modalOpen()) return;
        entry.timer = schedule(() => remove(entry), entry.duration);
    }
    return function notify(message, actionText = null, callback = null, duration = 3200, level = 'info') {
        const action = Boolean(actionText && typeof callback === 'function');
        level = ['success','warning','error'].includes(level) ? level : 'info';
        message = String(message ?? '').trim();
        if (!message) return;
        if(!action&&modalOpen()){inlineModalMessage(message);watchPosition();return;}
        // Identical informational messages share one slot; separate Undo callbacks never coalesce.
        const duplicate = !action && entries.find(e => !e.action && e.message === message && e.level === level);
        if (duplicate) { arm(duplicate); return; }
        const entry = {message, level, action, timer:null, hover:false, origin:doc.activeElement,
            duration:Math.max(Number.isFinite(duration) ? duration : 3200, action ? 10000 : ['warning','error'].includes(level) ? 8000 : 2800)};
        if (entries.length >= 2) {
            const candidate = entries.filter(e => !e.element.contains(doc.activeElement) && !e.hover && priority(e) <= priority(entry)).sort((a,b)=>priority(a)-priority(b))[0];
            if (!candidate) return; // Keep a bounded stack; durable task state belongs in its own panel.
            remove(candidate);
        }
        let container = doc.getElementById('cachyToastContainer');
        if (!container) { container = doc.createElement('div'); container.id='cachyToastContainer'; container.className='toastContainer'; doc.body.append(container); }
        // Per-message live regions, not an announcing parent plus nested regions.
        container.removeAttribute('aria-live');
        const toast = entry.element = doc.createElement('div'); toast.className=`cachyToast${level==='info'?'':' '+level}`;
        const msg = doc.createElement('span'); msg.className='toastMsg'; msg.setAttribute('role',level==='error'?'alert':'status');
        msg.setAttribute('aria-atomic','true');
        const actions = doc.createElement('div'); actions.className='toastActions';
        const button = (label, cls, handler) => { const b=doc.createElement('button'); b.type='button'; b.className=cls; b.textContent=label; b.addEventListener('click',handler); actions.append(b); return b; };
        if (action) button(actionText,'toastUndoBtn',()=>{ remove(entry,true); Promise.resolve().then(callback).catch(()=>notify('The requested action could not be completed.',null,null,8000,'error')); });
        const dismiss=button('×','toastDismissBtn',()=>remove(entry,true)); dismiss.setAttribute('aria-label','Dismiss notification');
        toast.append(msg,actions); container.append(toast); entries.push(entry);
        watchPosition();position();syncModal();
        msg.textContent=message;
        toast.addEventListener('pointerenter',()=>{entry.hover=true;pause(entry)});
        toast.addEventListener('pointerleave',()=>{entry.hover=false;arm(entry)});
        toast.addEventListener('focusin',()=>pause(entry));
        toast.addEventListener('focusout',()=>queueMicrotask(()=>{if(entries.includes(entry))arm(entry)}));
        arm(entry);
    };
}
