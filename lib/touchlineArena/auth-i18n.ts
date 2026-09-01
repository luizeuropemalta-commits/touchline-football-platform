import { TOUCHLINE_CLUB_OWNER_ROUTE_BASE } from "./club-owner-routes.ts";

export type TouchLineAuthLocale = "en-GB" | "pt-BR";

const TOUCHLINE_AUTH_URL_BASE = "https://touchline.local";
const TOUCHLINE_AUTH_RETURN_PATHS = [
  "/arena",
  TOUCHLINE_CLUB_OWNER_ROUTE_BASE,
  "/market-transfer",
  "/admin",
  "/notifications",
  "/inbox",
  "/football-search",
  "/visual-qa",
] as const;

const en = {
  layout: {
    arenaHome: "Arena Home",
    arenaOnline: "TouchLine Arena online",
    productAreas: "Cards · Squads · Market",
    journeyEyebrow: "TouchLine / Your journey starts here",
    accessEyebrow: "TouchLine / Arena Access",
    cinematicTitleTop: "Enter the",
    cinematicTitleBottom: "Arena",
    standardTitleTop: "TouchLine",
    standardTitleBottom: "Arena",
    cinematicDescription:
      "Create your ClubOwner identity, build a squad with your signature and step onto the pitch to compete for TouchLine titles.",
    standardDescription:
      "Enter TouchLine Arena. Build your squad, manage official player contracts, follow the rankings and prepare for every matchday.",
    cardLabel: "Cards",
    cardValue: "Elite",
    squadLabel: "Squad",
    squadValue: "XI",
    arenaLabel: "Arena",
    arenaValue: "LIVE",
    onboardingEyebrow: "ClubOwner onboarding",
    accessPanelEyebrow: "Game access",
    onboardingTitle: "Create your identity",
    accessPanelTitle: "Enter Arena",
    rights: "© 2026 TouchLine. All rights reserved.",
    marketOnline: "Market online",
    asideTitleTop: "Open cards.",
    asideTitleBottom: "Build squads.",
    features: [
      "Premium player cards",
      "Squad and formation management",
      "Market Transfer and live rankings",
    ],
  },
  login: {
    eyebrow: "Arena access",
    title: "Enter the arena",
    description: "Sign in to build your squad and enter TouchLine Arena.",
  },
  register: {
    back: "Back to access",
    eyebrow: "Arena access",
    title: "Create arena access",
    description: "Create secure access for TouchLine Arena and enter your squad environment.",
    betaTitle: "TouchLine Arena · Secure access",
    betaDescription:
      "Create your account, verify your identity and enter TouchLine Arena. Your account and progress remain protected.",
  },
  forgot: {
    back: "Back to access",
    eyebrow: "Account recovery",
    title: "Recover your career.",
    description: "Enter your email and we’ll send a secure reset link.",
  },
  reset: {
    back: "Back to access",
    eyebrow: "Secure recovery",
    title: "Set a new password.",
    description: "Choose a new password for your TouchLine Arena account.",
  },
  form: {
    fullName: "Full name",
    fullNamePlaceholder: "Alex Oliveira",
    email: "Email",
    emailPlaceholder: "you@example.com",
    password: "Password",
    forgotPassword: "Forgot password?",
    passwordPlaceholder: "At least 8 characters",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    updatePassword: "Update password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    terms:
      "I agree to the Terms and Privacy Policy. TouchLine measures active time, device class and feature areas to improve gameplay — never passwords, messages or typed content.",
    signIn: "Sign in",
    signingIn: "Signing in…",
    createAccount: "Create account",
    sendReset: "Send reset link",
    watchWithoutLogin: "Explore a public club",
    newToTouchLine: "New to TouchLine?",
    createAccess: "Create account",
    alreadyRegistered: "Already registered?",
    accessAccount: "Sign in",
    continueWith: "or continue with",
    continueWithGoogle: "Continue with Google",
    continueWithApple: "Continue with Apple",
    continueWithFacebook: "Continue with Facebook",
    registrationCompleteEyebrow: "Secure verification",
    registrationCompleteTitle: "Check your email",
    registrationCompleteDescription: "If this is a new account, we sent a secure confirmation link to:",
    registrationCompleteHint:
      "Open the message and confirm your email to enter TouchLine Arena. Check spam if needed. If this email already has an account, sign in or recover your password.",
    resendConfirmation: "Resend confirmation email",
    confirmationResent: "Confirmation email sent again. Check your inbox and spam folder.",
    confirmationResendFailed: "We could not resend the confirmation email. Wait a moment and try again.",
    useAnotherEmail: "Use another email",
    confirmationLinkError:
      "This confirmation link is invalid or has expired. Request a new email or sign in if your account is already confirmed.",
    authenticationUnavailable: "Authentication service is unavailable. Please try again later.",
    invalidCredentials: "Check your email and password and try again.",
    emailNotConfirmed: "Confirm your email before entering the Arena.",
    accountDisabled: "This account is disabled. Contact TouchLine support.",
    profileSetupFailed: "Your account was verified, but Arena access could not be prepared. Try again shortly.",
    sessionCookieFailure: "Your secure session could not be created. Try again in this browser.",
    welcomeUnavailable: "Unable to finish TouchLine Arena access.",
    accountCreated: "Account created. Check your email to confirm.",
    resetSent: "Reset instructions sent. Check your inbox.",
    recoveryChecking: "Checking your secure recovery session…",
    recoveryInvalid: "This recovery link is invalid or has expired. Request a new link to continue.",
    recoveryMismatch: "The passwords do not match.",
    recoveryUpdated: "Password updated securely.",
    requestNewReset: "Request a new recovery link",
    enterArena: "Enter the Arena",
    genericError: "Something went wrong.",
  },
};

const ptBR: typeof en = {
  layout: {
    arenaHome: "Início da Arena",
    arenaOnline: "TouchLine Arena online",
    productAreas: "Cards · Elencos · Mercado",
    journeyEyebrow: "TouchLine / Sua jornada começa aqui",
    accessEyebrow: "TouchLine / Acesso à Arena",
    cinematicTitleTop: "Entre na",
    cinematicTitleBottom: "Arena",
    standardTitleTop: "TouchLine",
    standardTitleBottom: "Arena",
    cinematicDescription:
      "Crie sua identidade ClubOwner, monte um elenco com a sua assinatura e entre em campo para disputar títulos na TouchLine.",
    standardDescription:
      "Entre na TouchLine Arena. Monte seu elenco, gerencie contratos oficiais de atletas, acompanhe os rankings e prepare-se para cada rodada.",
    cardLabel: "Cards",
    cardValue: "Elite",
    squadLabel: "Elenco",
    squadValue: "XI",
    arenaLabel: "Arena",
    arenaValue: "AO VIVO",
    onboardingEyebrow: "Cadastro ClubOwner",
    accessPanelEyebrow: "Acesso ao jogo",
    onboardingTitle: "Crie sua identidade",
    accessPanelTitle: "Entrar na Arena",
    rights: "© 2026 TouchLine. Todos os direitos reservados.",
    marketOnline: "Mercado online",
    asideTitleTop: "Abra cards.",
    asideTitleBottom: "Monte elencos.",
    features: [
      "Cards premium de atletas",
      "Gestão de elenco e formação",
      "Market Transfer e rankings ao vivo",
    ],
  },
  login: {
    eyebrow: "Acesso à Arena",
    title: "Entre na Arena",
    description: "Entre para montar seu elenco e acessar a TouchLine Arena.",
  },
  register: {
    back: "Voltar ao acesso",
    eyebrow: "Acesso à Arena",
    title: "Criar acesso à Arena",
    description: "Crie seu acesso seguro à TouchLine Arena e entre no ambiente do seu elenco.",
    betaTitle: "TouchLine Arena · Acesso seguro",
    betaDescription:
      "Crie sua conta, confirme sua identidade e entre na TouchLine Arena. Sua conta e seu progresso permanecem protegidos.",
  },
  forgot: {
    back: "Voltar ao acesso",
    eyebrow: "Recuperação de conta",
    title: "Recupere sua carreira.",
    description: "Digite seu e-mail e enviaremos um link seguro para redefinir sua senha.",
  },
  reset: {
    back: "Voltar ao acesso",
    eyebrow: "Recuperação segura",
    title: "Defina uma nova senha.",
    description: "Escolha uma nova senha para sua conta da TouchLine Arena.",
  },
  form: {
    fullName: "Nome completo",
    fullNamePlaceholder: "Alex Oliveira",
    email: "E-mail",
    emailPlaceholder: "voce@exemplo.com",
    password: "Senha",
    forgotPassword: "Esqueceu a senha?",
    passwordPlaceholder: "No mínimo 8 caracteres",
    newPassword: "Nova senha",
    confirmPassword: "Confirme a nova senha",
    updatePassword: "Atualizar senha",
    showPassword: "Mostrar senha",
    hidePassword: "Ocultar senha",
    terms:
      "Concordo com os Termos e a Política de Privacidade. A TouchLine mede tempo ativo, tipo de dispositivo e áreas utilizadas para melhorar a jogabilidade — nunca senhas, mensagens ou conteúdo digitado.",
    signIn: "Entrar",
    signingIn: "Entrando…",
    createAccount: "Criar conta",
    sendReset: "Enviar link de recuperação",
    watchWithoutLogin: "Explorar um clube público",
    newToTouchLine: "Ainda não é cadastrado?",
    createAccess: "Criar conta",
    alreadyRegistered: "Já possui uma conta?",
    accessAccount: "Entrar",
    continueWith: "ou continue com",
    continueWithGoogle: "Continuar com Google",
    continueWithApple: "Continuar com Apple",
    continueWithFacebook: "Continuar com Facebook",
    registrationCompleteEyebrow: "Verificação segura",
    registrationCompleteTitle: "Confira seu e-mail",
    registrationCompleteDescription: "Se este for um novo cadastro, enviamos um link seguro de confirmação para:",
    registrationCompleteHint:
      "Abra a mensagem e confirme seu e-mail para entrar na TouchLine Arena. Verifique o spam se necessário. Se este e-mail já tiver conta, entre ou recupere sua senha.",
    resendConfirmation: "Reenviar e-mail de confirmação",
    confirmationResent: "E-mail de confirmação reenviado. Confira sua caixa de entrada e o spam.",
    confirmationResendFailed: "Não foi possível reenviar a confirmação. Aguarde um momento e tente novamente.",
    useAnotherEmail: "Usar outro e-mail",
    confirmationLinkError:
      "Este link de confirmação é inválido ou expirou. Solicite um novo e-mail ou entre se sua conta já estiver confirmada.",
    authenticationUnavailable: "O serviço de autenticação está indisponível. Tente novamente mais tarde.",
    invalidCredentials: "Confira seu e-mail e senha e tente novamente.",
    emailNotConfirmed: "Confirme seu e-mail antes de entrar na Arena.",
    accountDisabled: "Esta conta está desativada. Entre em contato com o suporte TouchLine.",
    profileSetupFailed: "Sua conta foi verificada, mas não foi possível preparar o acesso à Arena. Tente novamente em instantes.",
    sessionCookieFailure: "Não foi possível criar sua sessão segura. Tente novamente neste navegador.",
    welcomeUnavailable: "Não foi possível concluir o acesso à TouchLine Arena.",
    accountCreated: "Conta criada. Confira seu e-mail para confirmar o cadastro.",
    resetSent: "Instruções enviadas. Confira sua caixa de entrada.",
    recoveryChecking: "Verificando sua sessão segura de recuperação…",
    recoveryInvalid: "Este link de recuperação é inválido ou expirou. Solicite um novo link para continuar.",
    recoveryMismatch: "As senhas não são iguais.",
    recoveryUpdated: "Senha atualizada com segurança.",
    requestNewReset: "Solicitar novo link de recuperação",
    enterArena: "Entrar na Arena",
    genericError: "Algo deu errado.",
  },
};

export type TouchLineAuthCopy = typeof en;

export function normalizeTouchLineAuthLocale(locale?: string | null): TouchLineAuthLocale {
  return locale === "pt-BR" ? "pt-BR" : "en-GB";
}

export function getTouchLineAuthCopy(locale?: string | null): TouchLineAuthCopy {
  return normalizeTouchLineAuthLocale(locale) === "pt-BR" ? ptBR : en;
}

export function touchLineAuthHref(path: string, locale?: string | null) {
  const normalizedLocale = normalizeTouchLineAuthLocale(locale);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}lang=${encodeURIComponent(normalizedLocale)}`;
}

export function normalizeTouchLineAuthReturnTo(returnTo?: string | null) {
  if (!returnTo || returnTo.includes("\\") || returnTo.startsWith("//")) return null;

  try {
    const candidate = new URL(returnTo, TOUCHLINE_AUTH_URL_BASE);
    if (candidate.origin !== TOUCHLINE_AUTH_URL_BASE) return null;
    const isAllowed = TOUCHLINE_AUTH_RETURN_PATHS.some(
      (path) => candidate.pathname === path || candidate.pathname.startsWith(`${path}/`),
    );
    return isAllowed ? `${candidate.pathname}${candidate.search}${candidate.hash}` : null;
  } catch {
    return null;
  }
}

export function touchLinePostAuthHref(
  returnTo: string | null | undefined,
  locale?: string | null,
  fallbackPath = "/arena",
) {
  const destination = new URL(
    normalizeTouchLineAuthReturnTo(returnTo) ?? fallbackPath,
    TOUCHLINE_AUTH_URL_BASE,
  );
  destination.searchParams.set("lang", normalizeTouchLineAuthLocale(locale));
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function touchLineAuthEntryHref(
  path: string,
  locale?: string | null,
  returnTo?: string | null,
) {
  const destination = new URL(touchLineAuthHref(path, locale), TOUCHLINE_AUTH_URL_BASE);
  const normalizedReturnTo = normalizeTouchLineAuthReturnTo(returnTo);
  if (normalizedReturnTo) destination.searchParams.set("returnTo", normalizedReturnTo);
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
