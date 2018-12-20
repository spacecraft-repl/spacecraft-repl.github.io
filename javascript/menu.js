const $ = (cssSelector) => document.querySelector(cssSelector);

const hamburgerImg = $('#hamburger img');
const hamburger = $('#hamburger');
const xButton = $('#x');
const menu = $('.menu');
const headerLogo = $('header > nav a');
const scrollDiv = $('#scroll');

const toggleExpand = (element) => element.classList.toggle('expand');
const hide = (element) => element.classList.add('hidden');
const show = (element) => element.classList.remove('hidden');
const fixPosition = (element) => element.style.position = 'fixed';
const absPosition = (element) => element.style.position = 'absolute';

document.addEventListener('DOMContentLoaded', () => {
  window.onresize = () => {
    if (window.innerWidth < 1200) absPosition(headerLogo);
  }

  hamburger.onclick = (e) => {
    hide(hamburgerImg);
    toggleExpand(hamburger);
    show(xButton);
    setTimeout(() => {
      fixPosition(headerLogo);      
      toggleExpand(hamburger);
      show(menu)
    }, 250);
  }

  xButton.onclick = (e) => {
    const xButton = e.currentTarget;
    hide(xButton);
    hide(menu);
    if (window.innerWidth < 1200) absPosition(headerLogo);    
    show(hamburgerImg);
  }

  scrollDiv.onclick = (e) => {
    window.scroll({
      top: window.innerHeight,
      behavior: 'smooth'
    });
  }
});