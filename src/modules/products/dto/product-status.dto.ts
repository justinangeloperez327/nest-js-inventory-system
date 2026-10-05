import { IsBoolean } from 'class-validator';

export class ProductStatusDto {
  @IsBoolean()
  active!: boolean;
}
