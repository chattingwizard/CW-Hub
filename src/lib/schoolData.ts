export interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

export interface ModuleDef {
  id: string;
  title: string;
  duration: string;
  videoFiles: string[];
  hasQuiz: boolean;
  quizQuestions?: QuizQuestion[];
  passingScore?: number;
}

export interface SectionDef {
  id: string;
  label: string;
  color: string;
  description: string;
  gateQuiz: string | null;
  alwaysOpen?: boolean;
  modules: ModuleDef[];
}

const VIDEO_BASE = 'https://bnmrdlqqzxenyqjknqhy.supabase.co/storage/v1/object/public/school-videos/';

export function videoUrl(file: string): string {
  return `${VIDEO_BASE}${file}`;
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'foundations',
    label: 'Foundations',
    color: '#0b7dba',
    description: 'What is OF, how money flows, what a chatter does, and safety rules.',
    gateQuiz: null,
    modules: [
      { id: 'f-1', title: 'Welcome + 3 Key Words', duration: '8 min', videoFiles: ['f-01-cw.mp4', 'f-01.mp4'], hasQuiz: false },
      { id: 'f-2', title: 'Who is Chatting Wizard? + Your Team', duration: '10 min', videoFiles: ['f-02.mp4'], hasQuiz: false },
      { id: 'f-3', title: 'What is OnlyFans + How Money Works', duration: '12 min', videoFiles: ['f-03.mp4', 'f-04.mp4', 'f-05.mp4'], hasQuiz: false },
      { id: 'f-4', title: 'Your Role + What a Shift Looks Like', duration: '10 min', videoFiles: ['f-06.mp4', 'f-07.mp4'], hasQuiz: false },
      { id: 'f-5', title: 'Banned Topics & How to Handle Them', duration: '12 min', videoFiles: ['f-08.mp4', 'f-09.mp4'], hasQuiz: false },
      { id: 'f-6', title: 'Foundations Review & Practice', duration: '15 min', videoFiles: [], hasQuiz: false },
    ],
  },
  {
    id: 'tools',
    label: 'Tools & Scripts',
    color: '#6e5dc9',
    description: 'Master the tools and scripts you\'ll use daily.',
    gateQuiz: 't-1',
    modules: [
      {
        id: 't-1', title: 'Foundations Review Quiz', duration: '5 min', videoFiles: [], hasQuiz: true, passingScore: 80,
        quizQuestions: [
          { question: 'Which is NOT a banned topic?', options: ['Drugs or alcohol use', 'Underage references', 'Talking about fitness and the gym', 'Meeting up in person'], correct: 2 },
          { question: 'Fan says "Let\'s get high together." What do you do?', options: ['Play along briefly', 'Say "I don\'t do drugs"', 'Ignore completely and redirect', 'Report the fan'], correct: 2 },
          { question: 'What is the correct shift flow?', options: ['Open chats -> Reply fastest -> Close app', 'Login -> Read handoff -> Unread tab -> Prioritize -> Reply -> Handoff notes', 'Reply to all fans -> Write notes -> Logout', 'Check schedule -> Open app -> Reply randomly'], correct: 1 },
          { question: 'Which word should you NEVER use in model messages?', options: ['Love', 'Baby', 'Meet', 'Miss'], correct: 2 },
          { question: 'You earn ___% of every net sale.', options: ['1%', '2%', '5%', '10%'], correct: 1 },
        ],
      },
      { id: 't-2', title: 'Infloww Walkthrough', duration: '15 min', videoFiles: ['t-02-infloww-walkthrough.mp4'], hasQuiz: false },
      { id: 't-3', title: 'Vault Pro: Content Folders Guide', duration: '10 min', videoFiles: [], hasQuiz: false },
      { id: 't-4', title: 'Scripts & Sequences 101', duration: '12 min', videoFiles: ['t-03-scripts-and-sequences.mp4'], hasQuiz: false },
      { id: 't-5', title: 'Script Dashboard & Personal Scripts', duration: '8 min', videoFiles: [], hasQuiz: false },
      { id: 't-6', title: 'Mass Messages (MMs)', duration: '10 min', videoFiles: [], hasQuiz: false },
      { id: 't-7', title: 'Model Personas: You ARE the Model', duration: '12 min', videoFiles: ['t-04-model-personas.mp4'], hasQuiz: false },
      { id: 't-8', title: 'The Journey Overview + PPV Ladder', duration: '15 min', videoFiles: ['t-05-journey-overview.mp4'], hasQuiz: false },
      { id: 't-9', title: 'The 48-Hour Rule: New Subs vs Time Wasters', duration: '10 min', videoFiles: ['t-06-the-48-hour-rule.mp4'], hasQuiz: false },
    ],
  },
  {
    id: 'journey',
    label: 'The Journey',
    color: '#0e946a',
    description: 'The complete fan journey from first message to aftercare.',
    gateQuiz: 'j-1',
    modules: [
      {
        id: 'j-1', title: 'Tools & Scripts Review Quiz', duration: '5 min', videoFiles: [], hasQuiz: true, passingScore: 80,
        quizQuestions: [
          { question: 'How do you activate a script in Infloww?', options: ['Click the script button', 'Type /commandname', 'Copy paste from the guide', 'Ask your TL to send it'], correct: 1 },
          { question: 'Fan subscribed 4 days ago, $0 spent. Category?', options: ['VIP', 'Potential buyer', 'Time Waster', 'New fan'], correct: 2 },
          { question: 'Correct order of journey phases?', options: ['Sexting -> Rapport -> Aftercare -> Welcome', 'Welcome -> Rapport -> Teasing Bridge -> Sexting -> Aftercare', 'Welcome -> Sexting -> Rapport -> Goodbye', 'Teasing -> Welcome -> PPV -> Done'], correct: 1 },
          { question: 'Where do you find a model\'s character profile?', options: ['Ask the client', 'Airtable', 'Chatter guide / model HTML page', 'Instagram'], correct: 2 },
          { question: 'Welcome Journey PPV prices are _____ than normal.', options: ['Lower', 'Higher', 'The same', 'Free'], correct: 0 },
        ],
      },
      { id: 'j-2', title: 'Rapport & Teasing Bridge', duration: '15 min', videoFiles: ['j-02-rapport-and-teasing-bridge.mp4'], hasQuiz: false },
      { id: 'j-3', title: 'Sexting & PPV Drops', duration: '15 min', videoFiles: ['j-03-sexting-and-ppv-drops.mp4'], hasQuiz: false },
      { id: 'j-4', title: 'Aftercare & Re-engagement', duration: '12 min', videoFiles: ['j-04-aftercare-and-reengagement.mp4'], hasQuiz: false },
      { id: 'j-5', title: 'Branch Rules & No Response Waves', duration: '12 min', videoFiles: ['j-05-branch-rules-and-nr-waves.mp4'], hasQuiz: false },
      { id: 'j-6', title: 'Fan Assessment & Prioritization', duration: '10 min', videoFiles: ['j-06-fan-assessment-and-prioritization.mp4'], hasQuiz: false },
      { id: 'j-7', title: 'Annotated Chat Examples', duration: '20 min', videoFiles: [], hasQuiz: false },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    color: '#d48a06',
    description: 'Advanced techniques for experienced chatters.',
    gateQuiz: 'a-1',
    modules: [
      {
        id: 'a-1', title: 'Journey Review Quiz', duration: '5 min', videoFiles: [], hasQuiz: true, passingScore: 80,
        quizQuestions: [
          { question: 'Fan goes silent 4 min after PPV drop. What do you do?', options: ['Send the PPV again', 'Wait 24 hours', 'Start NR-W1 (playful nudge)', 'Move to next fan'], correct: 2 },
          { question: 'How many NR waves maximum?', options: ['3', '4', '5', 'Unlimited'], correct: 2 },
          { question: 'Why is aftercare extra important after first sexting?', options: ['Fan might request a refund', 'Builds emotional connection for return + buy again', 'It\'s required by OF rules', 'To get a good review'], correct: 1 },
          { question: 'Which fan is HIGHEST priority?', options: ['Fan mid-sexting session', 'New subscriber (just joined)', 'Fan who tipped yesterday', 'Fan asking a question'], correct: 0 },
          { question: 'Max messages in a row without fan reply?', options: ['1', '2', '3', '5'], correct: 1 },
        ],
      },
      { id: 'a-2', title: 'Top 10 Objection Scripts', duration: '15 min', videoFiles: ['a-02-top-10-objection-scripts.mp4'], hasQuiz: false },
      { id: 'a-3', title: 'Custom Content Sales (TPDs)', duration: '15 min', videoFiles: ['a-03-custom-content-sales.mp4'], hasQuiz: false },
      { id: 'a-4', title: 'Game Sequences: An Alternative to Sexting', duration: '12 min', videoFiles: [], hasQuiz: false },
      { id: 'a-5', title: 'Multitasking: Juggling Multiple Fans', duration: '10 min', videoFiles: ['a-04-multitasking.mp4'], hasQuiz: false },
      { id: 'a-6', title: 'Shift Routine: Start, During & Handoff', duration: '10 min', videoFiles: ['a-05-shift-routine.mp4'], hasQuiz: false },
      { id: 'a-7', title: 'Common Mistakes to Avoid', duration: '10 min', videoFiles: ['a-06-common-mistakes.mp4'], hasQuiz: false },
      { id: 'a-8', title: 'Full Conversation Simulation', duration: '20 min', videoFiles: [], hasQuiz: false },
    ],
  },
  {
    id: 'golive',
    label: 'Go Live',
    color: '#dc2626',
    description: 'Final preparation and certification before your first shift.',
    gateQuiz: 'g-1',
    modules: [
      {
        id: 'g-1', title: 'Advanced Review Quiz', duration: '5 min', videoFiles: [], hasQuiz: true, passingScore: 80,
        quizQuestions: [
          { question: 'Fan says "That\'s too expensive." Which script?', options: ['Ignore and move on', '/price', '/goodbye', '/discount'], correct: 1 },
          { question: 'What are the 3 steps of TPDs?', options: ['Talk, Pay, Deliver', 'Teasing, Price, Distraction Shift', 'Tease, Propose, Delete', 'Try, Push, Drop'], correct: 1 },
          { question: '4 fans messaging. Who first?', options: ['Fan mid-sexting (active session)', 'Newest subscriber', 'Fan who tipped most', 'Oldest unread message'], correct: 0 },
          { question: 'What must you do at end of every shift?', options: ['Log out immediately', 'Send a mass message', 'Write handoff notes for every active conversation', 'Nothing'], correct: 2 },
          { question: 'When collect payment for custom?', options: ['Before the custom is made', 'After delivery', 'Half before, half after', 'Whenever the fan wants'], correct: 0 },
        ],
      },
      {
        id: 'g-2', title: 'Final Certification Quiz', duration: '15 min', videoFiles: [], hasQuiz: true, passingScore: 80,
        quizQuestions: [
          { question: 'What is a chatter?', options: ['A fan who chats a lot', 'Someone who talks to fans AS the model', 'An OnlyFans moderator', 'A social media manager'], correct: 1 },
          { question: 'OF takes ___% of every payment.', options: ['10%', '15%', '20%', '30%'], correct: 2 },
          { question: '#1 reason fans pay?', options: ['Content quality', 'Model appearance', 'Cheap prices', 'Attention'], correct: 3 },
          { question: 'Fan mentions banned topic, you should:', options: ['Answer honestly', 'Block them', 'Ignore completely and redirect', 'Report to OF'], correct: 2 },
          { question: 'Correct journey order?', options: ['Sexting -> Rapport -> PPV', 'Welcome -> Rapport -> TB -> Sexting -> Aftercare', 'PPV -> Sexting -> Goodbye', 'Welcome -> PPV -> Done'], correct: 1 },
          { question: 'PPV 1 is priced at:', options: ['$1-5', '$5-15', '$20-30', '$50+'], correct: 1 },
          { question: 'How activate script in Infloww?', options: ['Click button', 'Type /commandname', 'Drag and drop', 'Voice command'], correct: 1 },
          { question: 'Fan subscribed 5 days ago, $0 spent.', options: ['VIP fan', 'Potential buyer', 'Time Waster', 'New fan'], correct: 2 },
          { question: 'Max reply time during shift?', options: ['30 seconds', '1 minute', '2 minutes', '5 minutes'], correct: 2 },
          { question: 'Max messages in a row without reply?', options: ['1', '2', '3', '5'], correct: 1 },
          { question: 'Fan asks to meet up.', options: ['Agree to meet', 'Block immediately', 'Play in between, then redirect', 'Report to management'], correct: 2 },
          { question: 'Fan silent 4min after PPV.', options: ['Resend PPV', 'Wait forever', 'Start NR-W1', 'Move on'], correct: 2 },
          { question: 'How many NR waves max?', options: ['3', '4', '5', '10'], correct: 2 },
          { question: 'What does TPDs stand for?', options: ['Tips, Payments, Deals', 'Teasing, Price, Distraction Shift', 'Talk, Push, Deliver', 'Tease, Pay, Delete'], correct: 1 },
          { question: 'Min price custom video?', options: ['$150-200+', '$50-100', '$25-50', '$10-25'], correct: 0 },
          { question: 'When collect custom payment?', options: ['Before the custom is made', 'After delivery', 'Half and half', 'Weekly billing'], correct: 0 },
          { question: '% of messages from scripts?', options: ['50%', '60%', '80%', '100%'], correct: 2 },
          { question: 'After first sexting, most important?', options: ['Send more PPVs immediately', 'Invest heavily in aftercare', 'Take a break', 'Move to next fan'], correct: 1 },
          { question: 'Before Unread tab, you should:', options: ['Send mass messages', 'Check social media', 'Read handoff notes', 'Nothing'], correct: 2 },
          { question: 'Which word NEVER in model messages?', options: ['Love', 'Baby', 'Meet', 'Want'], correct: 2 },
        ],
      },
      { id: 'g-3', title: 'First Supervised Shift', duration: '4-6 hrs', videoFiles: [], hasQuiz: false },
    ],
  },
  {
    id: 'ongoing',
    label: 'Ongoing Development',
    color: '#6b7280',
    description: 'Continuous learning after graduation.',
    gateQuiz: null,
    alwaysOpen: true,
    modules: [
      { id: 'o-1', title: 'Week 2: Advanced Objection Handling', duration: '30 min', videoFiles: [], hasQuiz: false },
      { id: 'o-2', title: 'Week 3: Advanced Customs & Upselling', duration: '30 min', videoFiles: [], hasQuiz: false },
      { id: 'o-3', title: 'Week 4: Psychology & Advanced Techniques', duration: '30 min', videoFiles: [], hasQuiz: false },
      { id: 'o-4', title: 'Week 5+: KPI Mastery & Leadership', duration: '30 min', videoFiles: [], hasQuiz: false },
    ],
  },
];
