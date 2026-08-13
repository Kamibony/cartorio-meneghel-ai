import React, { useState, useEffect } from 'react';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../utils/firebase';

const AcceptInvite: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('oobCode');

    if (code) {
      setOobCode(code);
      verifyPasswordResetCode(auth, code)
        .then((userEmail) => {
          setEmail(userEmail);
          setIsValidating(false);
        })
        .catch((err) => {
          setError(err.message || 'Link inválido ou expirado.');
          setIsValidating(false);
        });
    } else {
      setError('Código de convite não encontrado.');
      setIsValidating(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (password.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres.');
        return;
    }

    if (!oobCode) {
      setError('Código inválido.');
      return;
    }

    setIsLoading(true);

    try {
      await confirmPasswordReset(auth, oobCode, password);
      setSuccess('Senha definida com sucesso. Você será redirecionado para o login...');
      setTimeout(() => {
          window.location.href = '/';
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Falha ao definir a senha. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
      return (
          <div className="min-h-screen bg-gray-100 flex items-center justify-center">
              <div className="text-gray-500 text-lg">Validando convite...</div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Aceitar Convite
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {email ? `Defina sua senha para ${email}` : 'Defina sua senha para acessar o sistema'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success ? (
             <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
                <p className="text-sm text-green-700">{success}</p>
             </div>
          ) : (
             <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Nova Senha
                  </label>
                  <div className="mt-1">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                    Confirmar Senha
                  </label>
                  <div className="mt-1">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isLoading || !!error && !oobCode}
                    className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                      (isLoading || (!!error && !oobCode)) ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                    } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                  >
                    {isLoading ? 'Salvando...' : 'Definir Senha e Entrar'}
                  </button>
                </div>
              </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AcceptInvite;
