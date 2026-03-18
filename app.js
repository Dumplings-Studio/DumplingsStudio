const games = [
  { id: 'demo-1', title: 'Dumpling Dash', desc: 'A tiny endless runner prototype.', url: 'dumpling-dash.html' },
  { id: 'demo-2', title: 'Steam Dumplings', desc: 'A puzzle-baking microgame.' },
  { id: 'demo-3', title: 'Pocket Chef', desc: 'Quick reaction mini-challenge.' }
];

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => e.setAttribute(k,v));
  children.forEach(c => e.append(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
}

function renderGames() {
  const grid = document.getElementById('gamesGrid');
  games.forEach(g => {
    const card = el('article', { class: 'card' },
      el('h3', {}, g.title),
      el('p', {}, g.desc),
      el('div', { class: 'actions' },
        el('a', { href: g.url || '#', class: 'button', 'data-id': g.id }, 'Play'),
        el('a', { href: '#', style: 'align-self:center; color:#334155; text-decoration:underline' }, 'Details')
      )
    );
    grid.appendChild(card);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  renderGames();
  document.querySelectorAll('.button').forEach(btn => {
    // if a button doesn't have a real href, keep the debug alert
    if ((btn.getAttribute('href') || '') === '#') {
      btn.addEventListener('click', e => {
        e.preventDefault();
        alert(`Launch demo: ${e.currentTarget.dataset.id}`);
      });
    }
  });
});
