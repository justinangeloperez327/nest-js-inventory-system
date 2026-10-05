export interface AuthUser {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
}
