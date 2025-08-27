
const API = "";
let currentUser = null;
const tokenKey = "boletin_token";

async function postJSON(url, body, opts={}){
  const headers = opts.headers || {};
  headers['Content-Type'] = 'application/json';
  if(localStorage.getItem(tokenKey)) headers['Authorization'] = 'Bearer ' + localStorage.getItem(tokenKey);
  const res = await fetch(url, { method: opts.method || 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return res.json();
}

async function getJSON(url){ 
  const headers = {};
  if(localStorage.getItem(tokenKey)) headers['Authorization'] = 'Bearer ' + localStorage.getItem(tokenKey);
  const res = await fetch(url, { headers });
  return res.json();
}

// Register
document.getElementById('registerForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = { username: fd.get('username'), email: fd.get('email'), password: fd.get('password') };
  const r = await postJSON('/api/register', body);
  if(r.error) return alert(r.error);
  alert('Registrado. Ahora inicia sesión.');
  e.target.reset();
});

// Login
document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = { email: fd.get('email'), password: fd.get('password') };
  const res = await postJSON('/api/login', body);
  if(res.error) return alert(res.error);
  localStorage.setItem(tokenKey, res.token);
  currentUser = res.user;
  document.getElementById('welcome').textContent = 'Conectado: ' + currentUser.username;
  document.getElementById('logoutBtn').classList.remove('hidden');
  document.getElementById('mustLogin').style.display = 'none';
  loadPosts();
  e.target.reset();
});

document.getElementById('logoutBtn').addEventListener('click', ()=>{
  localStorage.removeItem(tokenKey);
  currentUser = null;
  document.getElementById('welcome').textContent = '';
  document.getElementById('logoutBtn').classList.add('hidden');
  document.getElementById('mustLogin').style.display = '';
  loadPosts();
});

// Create post (with image)
document.getElementById('postForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!localStorage.getItem(tokenKey)) return alert('Debes iniciar sesión');
  const form = e.target;
  const fd = new FormData(form);
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem(tokenKey) },
    body: fd
  });
  const data = await res.json();
  if(data.error) return alert(data.error);
  form.reset();
  loadPosts();
});

// Load posts
async function loadPosts(){
  const posts = await getJSON('/api/posts');
  const container = document.getElementById('postsList');
  container.innerHTML = '';
  posts.forEach(p => {
    const div = document.createElement('div');
    div.className = 'post';
    div.innerHTML = `
      <h3>${escapeHtml(p.title)} <span class="small">(${p.category})</span></h3>
      <p class="small">Por ${escapeHtml(p.username)} - ${new Date(p.createdAt).toLocaleString()}</p>
      <p>${escapeHtml(p.content)}</p>
      ${p.image ? `<img src="${p.image.startsWith('/uploads') ? p.image : '/uploads/' + p.image}" alt="">` : ''}
      <div id="comments-${p.id}"></div>
    `;

    // delete button if owner
    const token = localStorage.getItem(tokenKey);
    if(token && currentUser){
      if(currentUser.id === p.userId){
        const btn = document.createElement('button');
        btn.textContent = 'Eliminar';
        btn.addEventListener('click', ()=> deletePost(p.id));
        div.appendChild(btn);
      }
    }

    // comment form
    const cform = document.createElement('form');
    cform.innerHTML = `<input name="content" placeholder="Comentar..." required><button>Enviar</button>`;
    cform.addEventListener('submit', (ev) => { ev.preventDefault(); addComment(p.id, new FormData(cform).get('content')); cform.reset(); });
    div.appendChild(cform);

    container.appendChild(div);

    loadComments(p.id);
  });
}

// Load comments
async function loadComments(postId){
  const cms = await getJSON(`/api/posts/${postId}/comments`);
  const container = document.getElementById('comments-' + postId);
  container.innerHTML = cms.map(c => `<div class="comment"><b>${escapeHtml(c.username)}</b>: ${escapeHtml(c.content)}</div>`).join('');
}

// add comment
async function addComment(postId, content){
  if(!localStorage.getItem(tokenKey)) return alert('Debes iniciar sesión para comentar');
  const res = await fetch(`/api/posts/${postId}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem(tokenKey) },
    body: JSON.stringify({ content })
  });
  const data = await res.json();
  if(data.error) return alert(data.error);
  loadComments(postId);
}

// delete post
async function deletePost(id){
  if(!confirm('Eliminar publicación?')) return;
  const res = await fetch('/api/posts/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + localStorage.getItem(tokenKey) } });
  const data = await res.json();
  if(data.error) return alert(data.error);
  loadPosts();
}

// helper escape
function escapeHtml(s){ return (s+'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// load user from token (best-effort)
(function init(){
  const token = localStorage.getItem(tokenKey);
  if(token){
    try{
      // payload decode (no verify) to show username in UI
      const payload = JSON.parse(atob(token.split('.')[1]));
      currentUser = { id: payload.id, username: payload.username };
      document.getElementById('welcome').textContent = 'Conectado: ' + currentUser.username;
      document.getElementById('logoutBtn').classList.remove('hidden');
      document.getElementById('mustLogin').style.display = 'none';
    }catch(e){}
  }
  loadPosts();
})();
