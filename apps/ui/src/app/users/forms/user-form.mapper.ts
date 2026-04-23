import { User } from '../User.interface';
import { UserFormValue } from './user-form.types';
import {
  CreateUserPayload,
  UpdateUserPayload,
} from '../services/users.service';

export function mapFormToCreateUserDto(
  value: UserFormValue
): CreateUserPayload {
  return {
    name: value.name,
    memberNumber: value.memberNumber || undefined,
    idNumber: value.idNumber || undefined,
    email: value.email,
    roles: value.roles,
    password: value.password || undefined,
    sports: value.sports,
    categories: value.categories,
    branches: value.branches,
  };
}

export function mapFormToUpdateUserDto(
  value: UserFormValue
): UpdateUserPayload {
  return {
    name: value.name,
    memberNumber: value.memberNumber || undefined,
    idNumber: value.idNumber || undefined,
    email: value.email,
    roles: value.roles,
    sports: value.sports,
    categories: value.categories,
    branches: value.branches,
  };
}

export function mapUserToForm(user: User): UserFormValue {
  return {
    name: user.name,
    memberNumber: user.memberNumber ?? '',
    idNumber: user.idNumber ?? '',
    email: user.email,
    roles: user.roles,
    password: undefined,
    sports: user.sports ?? [],
    categories: user.categories ?? [],
    branches: user.branches ?? [],
  };
}
