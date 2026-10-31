'use strict';

(() => {
    const button = document.querySelector('button[type="submit"]');
    const disc = document.querySelector('.disc');
    const middle = document.querySelector('.disc .middle');
    const card = document.querySelector('.registerCard');
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
            if (card) card.classList.add('thick');
            if (img) img.classList.add('slideIn');
            if (lefttext) lefttext.classList.add('slideTop');
            eqBars.forEach(bar => bar.classList.add('prepare'));
        });

        button.addEventListener('mouseleave', () => {
            if (disc) disc.classList.remove('expanded');
            if (middle) middle.classList.remove('fast');
            if (card) card.classList.remove('thick');
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
            const confirmPassword = formData.get('confirmPassword') || '';

            // Validation
            if (!username || !password || !confirmPassword) {
                showMessage('Please fill in all fields.');
                return;
            }

            if (username.length < 3 || username.length > 30) {
                showMessage('Username must be 3-30 characters long.');
                return;
            }

            if (password.length < 6) {
                showMessage('Password must be at least 6 characters long.');
                return;
            }

            if (password !== confirmPassword) {
                showMessage('Passwords do not match.');
                return;
            }

            if (button) {
                button.disabled = true;
                button.textContent = 'Signing Up...';
            }

            try {
                const response = await fetch('../php/auth/register.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, confirmPassword })
                });

                if (!response.ok) {
                    throw new Error(`Server returned status ${response.status}`);
                }

                const data = await response.json();

                if (data.success) {
                    showMessage(data.message || 'Account created! Loading workstation...', false);

                    if (img) img.classList.remove('slideIn');
                    if (lefttext) lefttext.classList.remove('slideTop');

                    setTimeout(() => {
                        window.location.href = '../index.html';
                    }, 1200);
                } else {
                    showMessage(data.message || 'Registration failed. Please try again.');
                    if (button) {
                        button.disabled = false;
                        button.textContent = 'Sign Up';
                    }
                }
            } catch (err) {
                console.error('Registration error:', err);
                showMessage('Unable to reach server. Please try again.');
                if (button) {
                    button.disabled = false;
                    button.textContent = 'Sign Up';
                }
            }
        });
    }
})();