import { IsBoolean } from 'class-validator';

export class UnitStatusDto {
  @IsBoolean()
  active!: boolean;
}
