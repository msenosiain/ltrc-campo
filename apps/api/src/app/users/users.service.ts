import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schemas/user.schema';
import { Model } from 'mongoose';
import { PaginationDto } from '../shared/pagination.dto';
import { UserFiltersDto } from './dto/user-filter.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginatedResponse, RoleEnum } from '@ltrc-campo/shared-api-model';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>
  ) {}

  async findOneByGoogleId(googleId: string): Promise<User | null> {
    return this.userModel.findOne({ googleId }).exec();
  }

  async findOneByEmail(
    email: string,
    includePassword = false
  ): Promise<User | null> {
    const query = this.userModel.findOne({ email });
    if (includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = new this.userModel(userData);
    return user.save();
  }

  async findAll(
    query: PaginationDto<UserFiltersDto>,
    caller?: User
  ): Promise<PaginatedResponse<User>> {
    const { page, size, filters = {}, sortBy, sortOrder = 'asc' } = query;
    const skip = (page - 1) * size;

    const queryFilters: Record<string, any> = {};

    if (filters.searchTerm) {
      queryFilters['$or'] = [
        { name: { $regex: new RegExp(filters.searchTerm, 'i') } },
        { email: { $regex: new RegExp(filters.searchTerm, 'i') } },
      ];
    }

    if (filters.role) {
      queryFilters['roles'] = filters.role;
    }

    if (filters.sport) {
      queryFilters['sports'] = { $in: [filters.sport] };
    }

    if (filters.categories?.length) {
      queryFilters['categories'] = { $in: filters.categories };
    } else if (filters.category) {
      queryFilters['categories'] = { $in: [filters.category] };
    }

    // Server-side restriction: non-admin callers (managers, coordinadores, coaches)
    // sólo pueden buscar staff dentro de sus sports/categories asignados —
    // mismo patrón que players.service.ts#findPaginated.
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      if (caller.sports?.length) {
        const requested = (queryFilters['sports'] as { $in?: string[] } | undefined)?.$in;
        const allowed = caller.sports as string[];
        queryFilters['sports'] = {
          $in: requested ? requested.filter((s) => allowed.includes(s)) : allowed,
        };
      }
      if (caller.categories?.length) {
        const requested = (queryFilters['categories'] as { $in?: string[] } | undefined)?.$in;
        const allowed = caller.categories as string[];
        queryFilters['categories'] = {
          $in: requested ? requested.filter((c) => allowed.includes(c)) : allowed,
        };
      }
    }

    const sort: Record<string, 1 | -1> = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort['name'] = 1;
    }

    const [items, total] = await Promise.all([
      this.userModel
        .find(queryFilters)
        .skip(skip)
        .limit(size)
        .sort(sort)
        .exec(),
      this.userModel.countDocuments(queryFilters).exec(),
    ]);

    return { items: items as unknown as User[], total, page, size };
  }

  async update(id: string, dto: UpdateUserDto): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(id, dto, { returnDocument: 'after' }).exec();
  }

  async delete(id: string): Promise<User | null> {
    return this.userModel.findByIdAndDelete(id).exec();
  }

  async resetPassword(id: string): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(id, { $unset: { password: 1 } }, { returnDocument: 'after' })
      .exec();
  }

  async setResetToken(id: string, token: string, expires: Date): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(id, { resetPasswordToken: token, resetPasswordExpires: expires })
      .exec();
  }

  async findByResetToken(token: string): Promise<User | null> {
    return this.userModel
      .findOne({ resetPasswordToken: token })
      .select('+resetPasswordToken')
      .exec();
  }

  async applyNewPassword(id: string, hashedPassword: string): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(id, {
        password: hashedPassword,
        $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 },
      })
      .exec();
  }
}
