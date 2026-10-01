import { useState } from 'react';
import './ForgotPasswordPage.css';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: Отправить запрос на восстановление пароля
    setSubmitted(true);
  };

  return (
    <div className="forgot-password-page">
      <div className="forgot-password-container">
        <h2>Восстановление пароля</h2>
        
        {submitted ? (
          <div className="success-message">
            <p>Восстановление пароля пока недоступно. Письмо не отправлено.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="Введите ваш email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit">Отправить</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ForgotPasswordPage;