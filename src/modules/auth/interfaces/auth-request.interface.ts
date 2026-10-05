import type { RequestWithId } from '../../../common/types/request-with-id.type.js';
import type { AuthUser } from './auth-user.interface.js';

export interface AuthRequest extends RequestWithId {
  user: AuthUser;
}
