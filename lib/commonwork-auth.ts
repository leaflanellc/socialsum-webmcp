import { getChatGPTUser } from '../app/chatgpt-auth';

const localIdentities = {
  'local-jonathan': { userId: 'local-jonathan', displayName: 'Jonathan Ferrell', email: 'jonathan@local.test' },
  'local-sarah': { userId: 'local-sarah', displayName: 'Sarah Chen', email: 'sarah@local.test' },
  'local-marcus': { userId: 'local-marcus', displayName: 'Marcus Reed', email: 'marcus@local.test' },
  'local-priya': { userId: 'local-priya', displayName: 'Priya Shah', email: 'priya@local.test' },
  'local-outsider': { userId: 'local-outsider', displayName: 'Outside Tester', email: 'outside@local.test' },
} as const;

export async function getCommonworkUser(request: Request) {
  if (process.env.NODE_ENV !== 'production') {
    const cookieIdentity = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('commonwork_test_user='))?.split('=')[1] as keyof typeof localIdentities | undefined;
    const requested = request.headers.get('x-commonwork-test-user') as keyof typeof localIdentities | null;
    const identity = cookieIdentity && cookieIdentity in localIdentities ? cookieIdentity : requested && requested in localIdentities ? requested : 'local-jonathan';
    return { ...localIdentities[identity], isAnonymous: false };
  }
  const user = await getChatGPTUser();
  return user
    ? { ...user, isAnonymous: false }
    : {
        userId: 'public-demo-viewer',
        displayName: 'Public visitor',
        email: 'public-demo@socialsum.local',
        isAnonymous: true,
      };
}

export const isLocalIdentityTesting = process.env.NODE_ENV !== 'production';
