import { LegalPage } from '../components/LegalPage';

const CONTACT_URL = 'https://tiagoromero.me/contact/';

/** Public terms of service — referenced by the Google OAuth consent screen. */
export function TermsOfService() {
  return (
    <LegalPage title="Termos de Serviço" updatedAt="27 de julho de 2026">
      <p>
        Estes Termos de Serviço (“Termos”) regem o uso do aplicativo <strong>Consultoria</strong> (“o
        app”). Ao acessar ou usar o app, você concorda com estes Termos. Se não concordar, não
        utilize o serviço.
      </p>

      <h2>1. O serviço</h2>
      <p>
        Consultoria é um aplicativo de acompanhamento de treino personalizado que permite a alunos
        registrar seus treinos e a treinadores acompanhar o progresso e fornecer feedback. O app se
        integra a serviços do Google (Sheets, Drive e Docs) para armazenar seus dados sob o seu
        próprio controle.
      </p>

      <h2>2. Conta e acesso</h2>
      <p>
        O acesso é feito por meio da sua Conta Google. Você é responsável por manter a segurança da
        sua conta e por todas as atividades realizadas nela. Você deve ter idade legal para celebrar
        um contrato ou possuir o consentimento de um responsável.
      </p>

      <h2>3. Uso aceitável</h2>
      <ul>
        <li>Você concorda em usar o app apenas para fins legais e de acordo com estes Termos.</li>
        <li>
          Você não deve tentar acessar dados de outros usuários sem autorização, interferir no
          funcionamento do serviço ou utilizá-lo para atividades fraudulentas.
        </li>
        <li>
          Você é o único responsável pelo conteúdo (incluindo vídeos e observações) que registra ou
          envia por meio do app.
        </li>
      </ul>

      <h2>4. Seus dados e conteúdo</h2>
      <p>
        Você mantém a titularidade dos seus dados e do conteúdo que cria. Os arquivos gerados pelo app
        (planilhas, documentos e vídeos) são armazenados no seu próprio Google Drive e permanecem sob
        o seu controle. O tratamento dos seus dados está descrito na nossa{' '}
        <a href="/privacidade">Política de Privacidade</a>.
      </p>

      <h2>5. Integração com serviços do Google</h2>
      <p>
        O app utiliza as APIs do Google para funcionar. O uso desses serviços também está sujeito aos
        termos do Google. Você pode revogar o acesso do app à sua Conta Google a qualquer momento em{' '}
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
        >
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <h2>6. Isenção de garantias</h2>
      <p>
        O app é fornecido “no estado em que se encontra”, sem garantias de qualquer tipo. Não
        garantimos que o serviço será ininterrupto, livre de erros ou totalmente seguro. O app não
        substitui orientação médica ou profissional; consulte um profissional de saúde antes de
        iniciar qualquer programa de exercícios.
      </p>

      <h2>7. Limitação de responsabilidade</h2>
      <p>
        Na máxima extensão permitida por lei, não nos responsabilizamos por danos indiretos,
        incidentais ou consequenciais decorrentes do uso ou da impossibilidade de uso do app,
        incluindo perda de dados.
      </p>

      <h2>8. Encerramento</h2>
      <p>
        Você pode parar de usar o app e revogar suas permissões a qualquer momento. Podemos suspender
        ou encerrar o acesso ao serviço em caso de violação destes Termos.
      </p>

      <h2>9. Alterações nos Termos</h2>
      <p>
        Podemos atualizar estes Termos periodicamente. A data da última atualização é indicada no
        topo desta página. O uso continuado do app após alterações constitui aceitação dos novos
        Termos.
      </p>

      <h2>10. Contato</h2>
      <p>
        Em caso de dúvidas sobre estes Termos, entre em contato pelo nosso{' '}
        <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
          formulário de contato
        </a>
        .
      </p>
    </LegalPage>
  );
}
