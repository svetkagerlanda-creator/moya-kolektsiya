// Community account UI; private local collections are never uploaded automatically.
(() => {
  const endpoint = 'https://nihheolmwvkgtvtmfzsv.supabase.co/functions/v1/collector-auth';
  const publishable = 'sb_publishable_M_mIhlp0ZqintLb0ONy8BQ_SzEBCAT0';
  const sessionKey = 'collector-community-session-v1';
  let mode = 'login';
  let recoveryCodes = null;
  let session = null;
  try { const saved=JSON.parse(sessionStorage.getItem(sessionKey)||'null'); if(saved?.expires_at*1000>Date.now()+15000) session=saved; } catch {}
  const escape = x => String(x??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const get = id => document.getElementById(id);
  function render() {
    if (recoveryCodes?.length) return '<section class="card form" style="max-width:560px;margin:auto"><h2>🔐 Збережи резервні коди</h2><div class="banner">Ці 5 кодів показуються лише зараз. Кожен одноразовий. Без пароля і кодів відновити акаунт без пошти не вийде.</div><pre class="card" style="white-space:pre-wrap;user-select:all">'+recoveryCodes.map(escape).join('\n')+'</pre><button class="alt" type="button" id="copyRecovery">Копіювати коди</button><button class="btn" type="button" id="finishRecovery">Я зберегла коди</button></section>';
    if(session) return (window.CollectorSocial?.render(session) || '<div class="banner">Соціальний модуль не завантажений</div>')+'<div style="margin-top:22px;text-align:right"><button class="alt" type="button" id="communityLogout">Вийти з акаунта</button></div>';
    return '<section class="card form" style="max-width:580px;margin:auto"><h2>💜 Спільнота колекціонерів</h2><p class="muted">Особистим каталогом можна користуватися без реєстрації. Акаунт потрібен лише для майбутньої синхронізації та спілкування.</p><div class="row"><button type="button" class="'+(mode==='login'?'btn':'alt')+'" data-auth-mode="login">Увійти</button><button type="button" class="'+(mode==='signup'?'btn':'alt')+'" data-auth-mode="signup">Реєстрація</button><button type="button" class="'+(mode==='recover'?'btn':'alt')+'" data-auth-mode="recover">Відновити доступ</button></div><form id="collectorAuthForm" class="form"><label><span class="fieldlabel">Нікнейм (українські або латинські літери, без цифр)</span><input class="field" name="handle" autocomplete="username" minlength="3" maxlength="30" pattern="[A-Za-zА-Яа-яІіЇїЄєҐґ_]+" required placeholder="FunkoQueen"></label>'+(mode==='recover'?'<label><span class="fieldlabel">Одноразовий резервний код</span><input class="field" name="code" autocomplete="off" required placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"></label>':'')+'<label><span class="fieldlabel">'+(mode==='recover'?'Новий пароль':'Пароль')+'</span><div style="display:flex;align-items:center;gap:8px"><input class="field" type="password" name="password" id="collectorPassword" style="flex:1;min-width:0" minlength="'+(mode==='signup'||mode==='recover'?'12':'1')+'" maxlength="128" autocomplete="'+(mode==='login'?'current-password':'new-password')+'" required><button class="alt" type="button" id="toggleCollectorPassword" aria-controls="collectorPassword" aria-pressed="false" aria-label="Показати пароль" style="white-space:nowrap;min-width:64px">👁 Показати</button></div></label><button class="btn" type="submit" id="authSubmit">'+({login:'Увійти',signup:'Створити акаунт',recover:'Змінити пароль'})[mode]+'</button><p id="authNotice" class="muted" role="status"></p></form><div class="banner">При реєстрації отримаєш 5 резервних кодів. Пошта й телефон не потрібні. Реєстрація нічого не завантажує з локального каталогу.</div></section>';
  }
  function attach(refresh) {
    if(recoveryCodes?.length) {
      get('copyRecovery')?.addEventListener('click',()=>{navigator.clipboard.writeText(recoveryCodes.join('\n')).then(()=>{get('copyRecovery').textContent='Скопійовано'}).catch(()=>{get('copyRecovery').textContent='Виділи та скопіюй коди вручну'})});
      get('finishRecovery')?.addEventListener('click',()=>{recoveryCodes=null;refresh()});
      return;
    }
    if(session) {get('communityLogout')?.addEventListener('click',()=>{session=null;sessionStorage.removeItem(sessionKey);window.CollectorSocial?.reset();refresh()});window.CollectorSocial?.attach(session,refresh);return;}
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
        session={handle:result.handle,access_token:result.access_token,expires_at:result.expires_at};
        sessionStorage.setItem(sessionKey,JSON.stringify(session));
        if(Array.isArray(result.recovery_codes))recoveryCodes=result.recovery_codes;
        refresh();
      }catch(err){notice.textContent=String(err?.message||err);}
      finally{button.disabled=false;}
    });
  }
  window.CollectorCommunity={render,attach,getSession:()=>session};
})();
