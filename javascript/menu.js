const $ = (cssSelector) => document.querySelector(cssSelector);

const hamburgerImg = $('#hamburger img');
const hamburger = $('#hamburger');
const xButton = $('#x');
const menu = $('.menu');

const toggleExpand = (element) => element.classList.toggle("expand");
const hide = (element) => element.classList.add("hidden");
const show = (element) => element.classList.remove("hidden");

document.addEventListener('DOMContentLoaded', () => {
  $('#hamburger').onclick = (e) => {
    const button = e.currentTarget;
    toggleExpand(button);
    hide(hamburgerImg);
    show(xButton);
    setTimeout(() => {
      toggleExpand(button);
      show(menu)
    }, 250);
  }

  $('#x').onclick = (e) => {
    const xButton = e.currentTarget;
    hide(xButton);
    hide(menu);
    show(hamburgerImg);
  }
});