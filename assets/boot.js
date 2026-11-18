"use strict";
(async () => {
  const [model, presentation] = await Promise.all([
    fetch("assets/model.json").then(response => response.json()),
    fetch("assets/presentation.json").then(response => response.json()),
  ]);
  window.gearboxData = model;
  window.demoMedia = {
    presentation,
    video: id => `assets/desktop-${id}.mp4`,
    poster: id => `assets/desktop-${id}.jpg`,
  };
  const script = document.createElement("script");
  script.src = "assets/page.js";
  document.body.appendChild(script);

  const film = document.getElementById("jevduo-film");
  film.addEventListener("play", () => {
    window.designDemo?.playDesktop(false);
    window.designDemo?.viewer.play(false);
  });
  new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) film.pause();
  }).observe(film);
  if (location.hash === "#video") film.scrollIntoView();
})();
