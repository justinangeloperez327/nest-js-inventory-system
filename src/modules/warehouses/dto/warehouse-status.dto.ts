import { IsBoolean } from 'class-validator';

export class WarehouseStatusDto {
  @IsBoolean()
  active!: boolean;
}
