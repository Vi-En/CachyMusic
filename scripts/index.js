'use strict';

(() => {
    const button = document.querySelector('button[type="submit"]');
    const disc = document.querySelector('.disc');
    const middle = document.querySelector('.disc .middle');
    const login = document.querySelector('.loginCard');
    const img = document.querySelector('.bad-apple');
    const lefttext = document.querySelector('.leftText');
    const outer = document.querySelector('.outer');
    const eqBars = document.querySelectorAll('[class^="eq"]');
    const form = document.querySelector('form');
    const authMessage = document.getElementById('authMessage');

    if (button) {
        button.addEventListener('mouseenter', () => {
            if (disc) disc.classList.add('expanded');
            if (middle) middle.classList.add('fast');
            if (login) login.classList.add('thick');
            if (img) img.classList.add('slideIn');
            if (lefttext) lefttext.classList.add('slideTop');
            eqBars.forEach(bar => bar.classList.add('prepare'));
        });

        button.addEventListener('mouseleave', () => {
            if (disc) disc.classList.remove('expanded');
            if (middle) middle.classList.remove('fast');
            if (login) login.classList.remove('thick');
            if (img) img.classList.remove('slideIn');
            if (lefttext) lefttext.classList.remove('slideTop');
            if (outer) outer.classList.remove('puff');
            eqBars.forEach(bar => bar.classList.remove('prepare'));
        });

        button.addEventListener('click', () => {
            if (outer) outer.classList.add('puff');
        });
    }

    function showMessage(text, isError = true) {
        if (!authMessage) return;
        authMessage.textContent = text;
        authMessage.className = `authMessage show ${isError ? 'error' : 'success'}`;
    }

    function clearMessage() {
        if (!authMessage) return;
        authMessage.textContent = '';
        authMessage.className = 'authMessage';
    }

    if (form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            clearMessage();

            const formData = new FormData(form);
            const username = (formData.get('username') || '').trim();
            const password = formData.get('password') || '';

            if (!username || !password) {
                showMessage('Please enter both username and password.');
                return;
            }

            if (button) {
                button.disabled = true;
                button.textContent = 'Signing In...';
            }

            const isRedirectDir = window.location.pathname.includes('/redirect/');
            const loginUrl = isRedirectDir ? '../php/auth/login.php' : 'php/auth/login.php';
            const targetUrl = isRedirectDir ? '../index.html' : 'index.html';

            try {
                const response = await fetch(loginUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json().catch(() => null);

                if (response.ok && data && data.success) {
                    showMessage('Welcome back! Loading workstation...', false);
                    if (img) img.classList.remove('slideIn');
                    if (lefttext) lefttext.classList.remove('slideTop');

                    await new Promise(resolve => setTimeout(resolve, 800));
                    window.location.href = targetUrl;
                } else {
                    const errorMsg = (data && data.message) ? data.message : 'Invalid username or password.';
                    showMessage(errorMsg, true);
                    if (button) {
                        button.disabled = false;
                        button.textContent = 'Sign In';
                    }
                }
            } catch (err) {
                console.error('Login submit error:', err);
                showMessage('Unable to connect to login service. Please try again.', true);
                if (button) {
                    button.disabled = false;
                    button.textContent = 'Sign In';
                }
            }
        });
    }
})();
