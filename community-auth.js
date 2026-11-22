// Community account UI; private local collections are never uploaded automatically.
(() => {
  const endpoint = 'https://nihheolmwvkgtvtmfzsv.supabase.co/functions/v1/collector-auth';
  const publishable = 'sb_publishable_M_mIhlp0ZqintLb0ONy8BQ_SzEBCAT0';
  const sessionKey = 'collector-community-session-v1';
  let mode = 'login';
  let recoveryCodes = null;
  let passwordChanged = false;
  let session=null,refreshing=null,refreshTimer=null,remember=true;
  const root='https://nihheolmwvkgtvtmfzsv.supabase.co';
  try{
    const old=JSON.parse(localStorage.getItem(sessionKey)||sessionStorage.getItem(sessionKey)||'null');
    if(old?.access_token&&(old.refresh_token||old.expires_at*1000>Date.now()+15000))session=old;
    remember=!!localStorage.getItem(sessionKey);
  }catch{}
  function persist(){
    if(!session){localStorage.removeItem(sessionKey);sessionStorage.removeItem(sessionKey);return}
    const target=remember?localStorage:sessionStorage;
    target.setItem(sessionKey,JSON.stringify(session));
    (remember?sessionStorage:localStorage).removeItem(sessionKey);
  }
  function schedule(){
    if(refreshTimer)clearTimeout(refreshTimer);
    if(!session?.refresh_token)return;
    const ms=Math.max(2000,Math.min(2147483647,session.expires_at*1000-Date.now()-90000));
    refreshTimer=setTimeout(()=>{getAccessToken(true).catch(()=>{})},ms);
  }
  async function getAccessToken(force=false){
    if(!session)return null;
    if(!force&&session.expires_at*1000>Date.now()+60000)return session.access_token;
    if(!session.refresh_token){
      if(session.expires_at*1000>Date.now()+1500)return session.access_token;
      return null;
    }
    if(refreshing)return refreshing;
    refreshing=(async()=>{
      try{
        const response=await fetch(root+'/auth/v1/token?grant_type=refresh_token',{
          method:'POST',headers:{'Content-Type':'application/json',apikey:publishable},
          body:JSON.stringify({refresh_token:session.refresh_token}),cache:'no-store'
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok){
          if(response.status===400||response.status===401||response.status===403){
            try{
              const other=JSON.parse(localStorage.getItem(sessionKey)||'null');
              if(other?.refresh_token&&other.refresh_token!==session?.refresh_token&&other.expires_at*1000>Date.now()+15000){
                session=other;remember=true;schedule();return session.access_token;
              }
            }catch{}
            session=null;persist();window.CollectorSocial?.reset();window.CollectorCloud?.signedOut();
            window.CollectorRefreshView?.();
          }
          throw Error('Не вдалося поновити сеанс');
        }
        if(!data.access_token||!data.refresh_token)throw Error('Сервер повернув неповний сеанс.');
        session={...session,access_token:data.access_token,refresh_token:data.refresh_token,
          expires_at:data.expires_at||Math.floor(Date.now()/1000)+Number(data.expires_in||3600)};
        persist();schedule();
        return session.access_token;
      }catch(error){
        if(session?.refresh_token){if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{getAccessToken(true).catch(()=>{})},60000)}
        throw error;
      }finally{refreshing=null}
    })();
    return refreshing;
  }
  function signOut(){
    const token=session?.access_token;
    session=null;if(refreshTimer)clearTimeout(refreshTimer);
    persist();window.CollectorSocial?.reset();window.CollectorCloud?.signedOut();
    if(token)fetch(root+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:publishable,Authorization:'Bearer '+token}}).catch(()=>{});
  }
  window.addEventListener('storage',event=>{
    if(event.key!==sessionKey)return;
    try{
      const saved=JSON.parse(event.newValue||'null');
      if(saved?.refresh_token&&saved.refresh_token!==session?.refresh_token){
        session=saved;remember=true;schedule();window.CollectorRefreshView?.();
      }else if(!saved&&remember){
        session=null;if(refreshTimer)clearTimeout(refreshTimer);window.CollectorSocial?.reset();
        window.CollectorCloud?.signedOut();window.CollectorRefreshView?.();
      }
    }catch{}
  });
  window.addEventListener('online',()=>{if(session)getAccessToken().catch(()=>{})});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)getAccessToken().catch(()=>{})});
  if(session){schedule();if(session.refresh_token)getAccessToken().catch(()=>{})}

  const escape = x => String(x??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const get = id => document.getElementById(id);
  function render() {
    if (recoveryCodes?.length) return '<section class="card form" style="max-width:560px;margin:auto"><h2>🔐 Збережи резервні коди</h2><div class="banner">Ці 5 кодів показуються лише зараз. Кожен одноразовий. Без пароля і кодів відновити акаунт без пошти не вийде.</div><pre class="card" style="white-space:pre-wrap;user-select:all">'+recoveryCodes.map(escape).join('\n')+'</pre><button class="alt" type="button" id="copyRecovery">Копіювати коди</button><button class="btn" type="button" id="finishRecovery">Я зберегла коди</button></section>';
    if(session) return (window.CollectorSocial?.render(session) || '<div class="banner">Соціальний модуль не завантажений</div>')+(window.CollectorCloud?.render()||'')
      +'<section class="card form" style="margin-top:16px"><h2>🔐 Безпека акаунта</h2><p class="muted">Змінити пароль можна без електронної пошти. Після зміни ти отримаєш нові п’ять резервних кодів, а попередні перестануть діяти.</p><details><summary style="cursor:pointer;font-weight:650">Змінити пароль</summary><form class="form" id="changeCollectorPassword" style="margin-top:14px"><label>Поточний пароль<input class="field" required type="password" name="current_password" autocomplete="current-password"></label><label>Новий пароль (від 12 символів)<input class="field" required type="password" minlength="12" maxlength="128" name="password" id="newCollectorPassword" autocomplete="new-password"></label><label class="row"><input type="checkbox" id="showNewCollectorPassword"> Показати новий пароль</label><button class="btn" type="submit">Змінити пароль і оновити резервні коди</button><p class="muted" id="changePasswordNotice" role="status"></p></form></details></section>'
      +'<div style="margin-top:22px;text-align:right"><button class="alt" type="button" id="communityLogout">Вийти з акаунта</button></div>';
    return '<section class="card form" style="max-width:580px;margin:auto"><h2>💜 Спільнота колекціонерів</h2><p class="muted">Особистим каталогом можна користуватися без реєстрації. Акаунт потрібен лише для майбутньої синхронізації та спілкування.</p><div class="row"><button type="button" class="'+(mode==='login'?'btn':'alt')+'" data-auth-mode="login">Увійти</button><button type="button" class="'+(mode==='signup'?'btn':'alt')+'" data-auth-mode="signup">Реєстрація</button><button type="button" class="'+(mode==='recover'?'btn':'alt')+'" data-auth-mode="recover">Відновити доступ</button></div><form id="collectorAuthForm" class="form"><label><span class="fieldlabel">Нікнейм (українські або латинські літери, без цифр)</span><input class="field" name="handle" autocomplete="username" minlength="3" maxlength="30" pattern="[A-Za-zА-Яа-яІіЇїЄєҐґ_]+" required placeholder="FunkoQueen"></label>'+(mode==='recover'?'<label><span class="fieldlabel">Одноразовий резервний код</span><input class="field" name="code" autocomplete="off" required placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"></label>':'')+'<label><span class="fieldlabel">'+(mode==='recover'?'Новий пароль':'Пароль')+'</span><div style="display:flex;align-items:center;gap:8px"><input class="field" type="password" name="password" id="collectorPassword" style="flex:1;min-width:0" minlength="'+(mode==='signup'||mode==='recover'?'12':'1')+'" maxlength="128" autocomplete="'+(mode==='login'?'current-password':'new-password')+'" required><button class="alt" type="button" id="toggleCollectorPassword" aria-controls="collectorPassword" aria-pressed="false" aria-label="Показати пароль" style="white-space:nowrap;min-width:64px">👁 Показати</button></div></label><label class="row" style="gap:8px"><input type="checkbox" id="authRemember" checked> Запам’ятати мій вхід на цьому пристрої</label><button class="btn" type="submit" id="authSubmit">'+({login:'Увійти',signup:'Створити акаунт',recover:'Змінити пароль'})[mode]+'</button><p id="authNotice" class="muted" role="status"></p></form><div class="banner">При реєстрації отримаєш 5 резервних кодів. Пошта й телефон не потрібні. Реєстрація нічого не завантажує з локального каталогу.</div></section>';
  }
  function attach(refresh) {
    if(recoveryCodes?.length) {
      get('copyRecovery')?.addEventListener('click',()=>{navigator.clipboard.writeText(recoveryCodes.join('\n')).then(()=>{get('copyRecovery').textContent='Скопійовано'}).catch(()=>{get('copyRecovery').textContent='Виділи та скопіюй коди вручну'})});
      get('finishRecovery')?.addEventListener('click',()=>{recoveryCodes=null;if(passwordChanged){passwordChanged=false;signOut()}refresh()});
      return;
    }
    if(session) {
      get('communityLogout')?.addEventListener('click',()=>{signOut();refresh()});
      window.CollectorSocial?.attach(session,refresh);window.CollectorCloud?.attach(refresh);
      get('showNewCollectorPassword')?.addEventListener('change',event=>{
        const el=get('newCollectorPassword');if(el)el.type=event.target.checked?'text':'password';
      });
      get('changeCollectorPassword')?.addEventListener('submit',async e=>{
        e.preventDefault();const form=e.currentTarget,notice=get('changePasswordNotice'),button=form.querySelector('[type=submit]');
        if(!confirm('Змінити пароль? Після цього потрібно буде увійти знову. Старі резервні коди перестануть діяти.'))return;
        button.disabled=true;notice.textContent='Перевіряємо пароль…';
        try{
          const token=await getAccessToken();
          if(!token)throw Error('Сеанс завершився. Увійди повторно.');
          const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:publishable,Authorization:'Bearer '+token},body:JSON.stringify({
            action:'change-password',handle:session.handle,current_password:form.elements.current_password.value,
            password:form.elements.password.value
          })});
          const result=await response.json().catch(()=>({}));
          if(!response.ok)throw Error(result.error||'Пароль не змінено');
          if(!Array.isArray(result.recovery_codes)||result.recovery_codes.length!==5)throw Error('Пароль змінено, але коди відновлення не надано. Звернися до підтримки.');
          recoveryCodes=result.recovery_codes;passwordChanged=true;refresh();
        }catch(error){notice.textContent=String(error.message||error)}
        finally{button.disabled=false}
      });
      return;
    }
    document.querySelectorAll('[data-auth-mode]').forEach(btn=>btn.addEventListener('click',()=>{mode=btn.dataset.authMode;refresh()}));
    get('toggleCollectorPassword')?.addEventListener('click',()=>{
      const field=get('collectorPassword'),button=get('toggleCollectorPassword');
      if(!field||!button)return;
      const visible=field.type==='password';
      field.type=visible?'text':'password';
      button.textContent=visible?'🙈 Приховати':'👁 Показати';
      button.setAttribute('aria-label',visible?'Приховати пароль':'Показати пароль');
      button.setAttribute('aria-pressed',String(visible));
    });
    get('collectorAuthForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      const form=e.currentTarget, button=get('authSubmit'),notice=get('authNotice');
      const payload={action:mode,handle:form.elements.handle.value.trim().toLowerCase(),password:form.elements.password.value};
      if(mode==='recover')payload.code=form.elements.code.value.trim().toUpperCase();
      if(mode==='signup'&&!window.confirm('Створити акаунт? Твій локальний каталог не буде опубліковано чи синхронізовано.'))return;
      button.disabled=true;notice.textContent='З’єднання із сервером…';
      try{
        const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':publishable},body:JSON.stringify(payload)});
        const result=await response.json();
        if(!response.ok) throw new Error(result.error||'Помилка сервера');
        if(mode==='recover'){mode='login';refresh();const n=get('authNotice');if(n)n.textContent='Пароль змінено. Тепер увійди.';return;}
        session={handle:result.handle,access_token:result.access_token,refresh_token:result.refresh_token,expires_at:result.expires_at};
        remember=get('authRemember')?.checked!==false;
        persist();schedule();
        if(Array.isArray(result.recovery_codes))recoveryCodes=result.recovery_codes;
        refresh();
      }catch(err){notice.textContent=String(err?.message||err);}
      finally{button.disabled=false;}
    });
  }
  window.CollectorCommunity={render,attach,getSession:()=>session,getAccessToken,signOut};
})();
