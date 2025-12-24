// Function to toggle dark mode
const darkModeToggleMobile = document.getElementById('darkModeToggleMobile');
const darkModeToggleDesktop = document.getElementById('darkModeToggleDesktop');

if (darkModeToggleMobile || darkModeToggleDesktop) {
  const html = document.documentElement;
  const iconSpans = document.querySelectorAll('.darkModeIcon');

  const applyTheme = (theme) => {
    if (theme === 'dark') {
      html.setAttribute('data-bs-theme', 'dark');
      iconSpans.forEach(icon => icon.textContent = '🌙');
    } else {
      html.removeAttribute('data-bs-theme');
      iconSpans.forEach(icon => icon.textContent = '☀️');
    }
    localStorage.setItem('theme', theme);
  };

  const toggleDarkMode = () => {
    const currentTheme = html.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  };

  // init localStorage (default: dark)
  const storedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(storedTheme);

  if (darkModeToggleMobile) {
    darkModeToggleMobile.addEventListener('click', toggleDarkMode);
  }
  if (darkModeToggleDesktop) {
    darkModeToggleDesktop.addEventListener('click', toggleDarkMode);
  }
}