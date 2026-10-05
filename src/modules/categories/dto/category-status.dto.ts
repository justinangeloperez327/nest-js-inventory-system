import { IsBoolean } from 'class-validator';

export class CategoryStatusDto {
  @IsBoolean()
  active!: boolean;
}
