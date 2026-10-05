import { IsBoolean } from 'class-validator';

export class SetUnitStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
