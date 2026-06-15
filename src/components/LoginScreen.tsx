import React, { useState } from 'react';
import { MailIcon, LockIcon, ArrowForwardIcon } from './Icons';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export const LoginScreen = ({ onLoginSuccess }: LoginScreenProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Por favor complete todos los campos');
      return;
    }
    // Mock successful login
    onLoginSuccess();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      <main 
        className="w-full max-w-md bg-surface-container-lowest rounded-xl p-8 md:p-12 border border-outline-variant/15 select-none" 
        style={{ boxShadow: '0 8px 32px rgba(25, 27, 35, 0.06)' }}
      >
        {/* Header / Branding */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold tracking-tight text-on-surface font-headline mb-2">Revit2Etabs</h1>
          <p className="text-sm text-on-surface-variant font-body">Engineering precise 3D environments.</p>
        </div>

        {/* Login Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="p-3 text-xs bg-error-container text-on-error-container rounded border border-error/10">
              {error}
            </div>
          )}

          {/* Email Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-on-surface font-label" htmlFor="email">
              Correo Electrónico
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                <MailIcon className="w-5 h-5" />
              </div>
              <input 
                className="block w-full pl-10 pr-3 py-3 bg-surface-container-highest border border-transparent rounded-DEFAULT focus:outline-none focus:ring-1 focus:ring-primary focus:bg-primary-fixed focus:border-primary text-on-surface font-body sm:text-sm transition-all"
                id="email" 
                name="email" 
                placeholder="ingeniero@atelier.com" 
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-on-surface font-label" htmlFor="password">
              Contraseña
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                <LockIcon className="w-5 h-5" />
              </div>
              <input 
                className="block w-full pl-10 pr-3 py-3 bg-surface-container-highest border border-transparent rounded-DEFAULT focus:outline-none focus:ring-1 focus:ring-primary focus:bg-primary-fixed focus:border-primary text-on-surface font-body sm:text-sm transition-all"
                id="password" 
                name="password" 
                placeholder="••••••••" 
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
              />
            </div>
          </div>

          {/* Options Row */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center">
              <input 
                className="h-4 w-4 text-primary focus:ring-primary border-outline rounded-sm bg-surface-container-highest cursor-pointer" 
                id="remember-me" 
                name="remember-me" 
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label className="ml-2 block text-sm text-on-surface-variant font-body cursor-pointer hover:text-on-surface transition-colors" htmlFor="remember-me">
                Recordar sesión
              </label>
            </div>
            <div className="text-sm">
              <a 
                className="font-medium text-primary hover:text-primary-container transition-colors" 
                href="#" 
                onClick={(e) => e.preventDefault()}
              >
                ¿Olvidó su contraseña?
              </a>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button 
              className="w-full h-12 flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-on-primary btn-primary-gradient hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary hover:scale-[0.99] active:scale-[0.97] transition-all duration-200 cursor-pointer"
              type="submit"
            >
              <span>Acceder</span>
              <ArrowForwardIcon className="ml-2 w-5 h-5" />
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-on-surface-variant font-body leading-relaxed">
            Al continuar, acepta nuestros{' '}
            <a className="text-primary hover:underline hover:text-primary-container transition-colors" href="#" onClick={(e) => e.preventDefault()}>
              Términos de Servicio
            </a>{' '}
            y{' '}
            <a className="text-primary hover:underline hover:text-primary-container transition-colors" href="#" onClick={(e) => e.preventDefault()}>
              Política de Privacidad
            </a>.
          </p>
        </div>
      </main>
    </div>
  );
};
