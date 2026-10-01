import HintedInput from '../../components/HintedInput/HintedInput';
import { INPUT_RULES, inputError } from '../../core/domain/services/authPolicy';
import { useState } from 'react';
import './ForgotPasswordPage.css';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationError = inputError('email', email);
    setError(validationError);
    if (validationError) return;
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
          <form noValidate onSubmit={handleSubmit}>
            <HintedInput
              type="email"
              hint={INPUT_RULES.email}
              placeholder="Введите ваш email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <p role="alert">{error}</p>}
            <button type="submit">Отправить</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ForgotPasswordPage;