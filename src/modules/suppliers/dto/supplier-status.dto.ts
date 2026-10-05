import { IsBoolean } from 'class-validator';

export class SupplierStatusDto {
  @IsBoolean()
  active!: boolean;
}
