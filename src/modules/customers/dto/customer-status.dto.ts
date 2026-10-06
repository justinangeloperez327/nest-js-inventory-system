import { IsBoolean } from 'class-validator';

export class CustomerStatusDto {
  @IsBoolean()
  active!: boolean;
}
