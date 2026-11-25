const preferred = navigator.languages?.[0] || navigator.language;
if (!/^hr(?:-|$)/i.test(preferred ?? '')) {
  location.replace('/about/en/' + location.search + location.hash);
}
