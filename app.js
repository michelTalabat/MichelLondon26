async function loadData() {
  const res = await fetch('data.json');
  const data = await res.json();
  const main = document.getElementById('content');

  main.innerHTML = data.sections
    .map(s => `<section id="${s.id}"><h2>${s.heading}</h2><p>${s.content}</p></section>`)
    .join('');
}

loadData();
