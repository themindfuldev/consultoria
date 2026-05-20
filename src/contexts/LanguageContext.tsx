import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { Language } from '../types';

// Re-export so existing imports from this file continue to work.
export type { Language };

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, variables?: Record<string, string>) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // General
    appName: 'Consultoria',
    tagline: 'Your premium fitness workspace',
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    back: 'Back',
    logout: 'Sign Out',
    settings: 'Settings',
    language: 'Language',
    english: 'English',
    portuguese: 'Portuguese',

    // Auth & Landing
    loginTitle: 'Elevate Your Training',
    loginSubtitle: "Beautiful, non-destructive workout tracking integrated seamlessly with your trainer's Google Sheets.",
    signInWithGoogle: 'Sign in with Google',
    roleSelectionTitle: 'Choose Your Role',
    roleSelectionSubtitle: 'Are you tracking workouts or coaching students?',
    iAmTrainer: 'I am a Trainer / Coach',
    iAmStudent: 'I am a Student / Athlete',

    // Trainer Dashboard
    trainerDashboard: 'Trainer Dashboard',
    workspaceSetupInProgress: 'Setting up your workspace…',
    workspaceSetupFailed: 'Workspace setup incomplete.',
    retrySetup: 'Retry Setup',
    exerciseLibrary: 'Exercise Library',
    openExerciseLibrary: 'Open Exercise Library',
    inviteStudent: 'Invite Student',
    inviteStudentPlaceholder: "Enter student's Google email",
    sendInvite: 'Send Invitation',
    studentEmail: 'Student Email',
    status: 'Status',
    actions: 'Actions',
    activeStudents: 'Active Students',
    pendingInvitations: 'Pending Invitations',
    readOnlyStudents: 'Read-Only (Removed)',
    noStudentsYet: 'No students yet. Invite one above!',
    removeStudent: 'Remove',
    revokeInvite: 'Revoke',
    removeStudentConfirm: 'Remove this student? They will keep read-only access to their history.',
    revokeInviteConfirm: 'Revoke this invitation?',
    deleteAccount: 'Delete My Account',
    deleteAccountConfirm: 'WARNING: This permanently deletes your account and trainer workspace. Students will lose active access. This cannot be undone. Proceed?',
    dangerZone: 'Danger Zone',

    // Student Dashboard
    studentDashboard: 'Student Dashboard',
    pendingInvitationsBanner: 'You have pending workspace invitations',
    acceptInvitation: 'Accept',
    declineInvitation: 'Decline',
    myWorkspaces: 'My Workspaces',
    readOnlyTag: 'Read-Only',
    noWorkspacesYet: 'No workspaces yet. Ask your trainer to invite you using your Google email.',
    activeCycle: 'Active Cycle',
    startWorkout: 'Start Workout',
    weeklyWorkoutList: 'Weekly Sessions',
    comingSoon: 'Coming soon',

    // Workout Tracker
    preWorkoutTitle: "Let's Get Started!",
    preWorkoutSubtitle: 'Check in before pushing your limits.',
    energyQuestion: 'What is your energy level right now?',
    feelingBeforeQuestion: 'How are you feeling overall?',
    feelingWell: 'Well / Strong',
    feelingNotWell: 'Not Well / Tired',
    startSession: 'Start Session',
    finishSession: 'Finish Session',
    postWorkoutTitle: 'Workout Completed!',
    postWorkoutSubtitle: 'Awesome job today! Log how you feel.',
    feelingAfterQuestion: 'How do you feel after this session?',
    feelingSame: 'About the same',
    feelingBetter: 'A little better',
    feelingWorse: 'A little worse',
    savingWorkout: 'Saving workout to Google Sheets…',
    congratsTitle: 'Congratulations!',
    congratsMessage: 'Your workout has been logged. Your trainer has been notified.',

    // Exercise Grid
    group: 'Group',
    exercise: 'Exercise',
    sets: 'Sets',
    reps: 'Reps',
    load: 'Load (kg)',
    rpe: 'RPE',
    restTime: 'Rest',
    observations: 'Observations',
    customized: 'Customized',
    completed: 'Done',

    // Feedback
    provideFeedback: 'Provide Feedback',
    feedbackTitle: 'Weekly Training Feedback',
    feedbackDocLinked: 'Feedback Document Linked',
    viewFeedbackDoc: 'Open Google Doc Feedback',
    commentsPlaceholder: 'Write your comments, adjustments, and feedback here…',
    attachVideos: 'Attach Video / Image Links (one per line)',
    submitFeedback: 'Submit & Sync Feedback',

    // Reports
    viewReports: 'View Progression Reports',
    reportsTitle: 'Training Analytics',
    loadEvolution: 'Load (Weight) Evolution',
    rpeEvolution: 'RPE Intensity Trend',
    sentimentEvolution: 'Energy & Well-being Trends',
    selectExercise: 'Select Exercise',

    // Progress Photos
    progressPhotos: 'Progress Photos',
    uploadPhoto: 'Add Progress Photos',
    openDriveFolder: 'Open in Google Drive',
    timeline: 'Timeline',
    noPhotosYet: 'No progress photos yet.',
    compare: 'Compare Side-by-Side',
  },

  'pt-BR': {
    // General
    appName: 'Consultoria',
    tagline: 'Seu espaço de treino premium',
    loading: 'Carregando…',
    save: 'Salvar',
    cancel: 'Cancelar',
    delete: 'Excluir',
    back: 'Voltar',
    logout: 'Sair',
    settings: 'Configurações',
    language: 'Idioma',
    english: 'Inglês',
    portuguese: 'Português',

    // Auth & Landing
    loginTitle: 'Eleve Seus Treinos',
    loginSubtitle: 'Acompanhamento interativo e sofisticado integrado diretamente com a planilha do seu treinador.',
    signInWithGoogle: 'Entrar com Google',
    roleSelectionTitle: 'Escolha Seu Perfil',
    roleSelectionSubtitle: 'Você irá registrar seus treinos ou gerenciar seus alunos?',
    iAmTrainer: 'Sou Treinador / Personal',
    iAmStudent: 'Sou Aluno / Atleta',

    // Trainer Dashboard
    trainerDashboard: 'Painel do Treinador',
    workspaceSetupInProgress: 'Configurando seu workspace…',
    workspaceSetupFailed: 'Configuração do workspace incompleta.',
    retrySetup: 'Tentar Novamente',
    exerciseLibrary: 'Biblioteca de Exercícios',
    openExerciseLibrary: 'Abrir Biblioteca de Exercícios',
    inviteStudent: 'Convidar Aluno',
    inviteStudentPlaceholder: 'Digite o e-mail Google do aluno',
    sendInvite: 'Enviar Convite',
    studentEmail: 'E-mail do Aluno',
    status: 'Status',
    actions: 'Ações',
    activeStudents: 'Alunos Ativos',
    pendingInvitations: 'Convites Pendentes',
    readOnlyStudents: 'Somente Leitura (Removidos)',
    noStudentsYet: 'Nenhum aluno ainda. Convide alguém acima!',
    removeStudent: 'Remover',
    revokeInvite: 'Revogar',
    removeStudentConfirm: 'Remover este aluno? Ele manterá acesso somente leitura ao histórico.',
    revokeInviteConfirm: 'Revogar este convite?',
    deleteAccount: 'Excluir Minha Conta',
    deleteAccountConfirm: 'AVISO: Isso exclui permanentemente sua conta e workspace. Alunos perderão o acesso ativo. Esta ação não pode ser desfeita. Prosseguir?',
    dangerZone: 'Zona de Perigo',

    // Student Dashboard
    studentDashboard: 'Painel do Aluno',
    pendingInvitationsBanner: 'Você tem convites de workspace pendentes',
    acceptInvitation: 'Aceitar',
    declineInvitation: 'Recusar',
    myWorkspaces: 'Meus Workspaces',
    readOnlyTag: 'Somente Leitura',
    noWorkspacesYet: 'Nenhum workspace ainda. Peça ao seu treinador para te convidar pelo e-mail do Google.',
    activeCycle: 'Ciclo Ativo',
    startWorkout: 'Iniciar Treino',
    weeklyWorkoutList: 'Sessões da Semana',
    comingSoon: 'Em breve',

    // Workout Tracker
    preWorkoutTitle: 'Vamos Começar!',
    preWorkoutSubtitle: 'Responda antes de dar o seu máximo.',
    energyQuestion: 'Qual seu nível de energia agora?',
    feelingBeforeQuestion: 'Como você está se sentindo no geral?',
    feelingWell: 'Bem / Forte',
    feelingNotWell: 'Indisposto / Cansado',
    startSession: 'Iniciar Sessão',
    finishSession: 'Finalizar Treino',
    postWorkoutTitle: 'Treino Concluído!',
    postWorkoutSubtitle: 'Excelente trabalho! Registre como você se sente.',
    feelingAfterQuestion: 'Como se sente após esta sessão?',
    feelingSame: 'Quase igual',
    feelingBetter: 'Um pouco melhor',
    feelingWorse: 'Um pouco pior',
    savingWorkout: 'Salvando treino na Planilha Google…',
    congratsTitle: 'Parabéns!',
    congratsMessage: 'Seu treino foi registrado. Seu treinador foi notificado.',

    // Exercise Grid
    group: 'Grupo',
    exercise: 'Exercício',
    sets: 'Séries',
    reps: 'Reps',
    load: 'Carga (kg)',
    rpe: 'RPE',
    restTime: 'Descanso',
    observations: 'Observações',
    customized: 'Alterado',
    completed: 'Feito',

    // Feedback
    provideFeedback: 'Dar Feedback',
    feedbackTitle: 'Feedback Semanal de Treino',
    feedbackDocLinked: 'Documento de Feedback Vinculado',
    viewFeedbackDoc: 'Abrir Documento Google',
    commentsPlaceholder: 'Escreva seus comentários, ajustes e feedback aqui…',
    attachVideos: 'Anexar links de vídeos / imagens (um por linha)',
    submitFeedback: 'Enviar & Sincronizar Feedback',

    // Reports
    viewReports: 'Ver Relatórios de Evolução',
    reportsTitle: 'Análise de Treinos',
    loadEvolution: 'Evolução de Cargas',
    rpeEvolution: 'Tendência de Intensidade (RPE)',
    sentimentEvolution: 'Tendência de Energia & Bem-estar',
    selectExercise: 'Selecionar Exercício',

    // Progress Photos
    progressPhotos: 'Fotos de Evolução',
    uploadPhoto: 'Adicionar Fotos de Evolução',
    openDriveFolder: 'Abrir no Google Drive',
    timeline: 'Linha do Tempo',
    noPhotosYet: 'Nenhuma foto de evolução ainda.',
    compare: 'Comparar Lado a Lado',
  },
};

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

interface LanguageProviderProps {
  children: React.ReactNode;
  userUid?: string;
  /** When provided (after profile loads), overrides the initial localStorage value. */
  initialLanguage?: Language;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({
  children,
  userUid,
  initialLanguage,
}) => {
  const [language, setLangState] = useState<Language>(() => {
    // Priority: initialLanguage prop > localStorage > browser detection
    if (initialLanguage) return initialLanguage;
    const saved = localStorage.getItem('selectedLanguage');
    if (saved === 'en' || saved === 'pt-BR') return saved as Language;
    return navigator.language.startsWith('pt') ? 'pt-BR' : 'en';
  });

  // Sync when the profile loads (initialLanguage changes from undefined to a value)
  useEffect(() => {
    if (initialLanguage && initialLanguage !== language) {
      setLangState(initialLanguage);
    }
  // Only run when initialLanguage first becomes defined
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLanguage]);

  useEffect(() => {
    localStorage.setItem('selectedLanguage', language);
  }, [language]);

  const setLanguage = async (lang: Language) => {
    setLangState(lang);
    if (userUid) {
      try {
        await updateDoc(doc(db, 'users', userUid), { selectedLanguage: lang });
      } catch (err) {
        console.error('Failed to sync language to Firestore:', err);
      }
    }
  };

  const t = (key: string, variables?: Record<string, string>): string => {
    let text = translations[language][key] ?? translations['en'][key] ?? key;
    if (variables) {
      for (const [k, v] of Object.entries(variables)) {
        text = text.replace(`{${k}}`, v);
      }
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
};
