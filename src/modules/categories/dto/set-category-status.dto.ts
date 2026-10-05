import { IsBoolean } from 'class-validator';

export class SetCategoryStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
