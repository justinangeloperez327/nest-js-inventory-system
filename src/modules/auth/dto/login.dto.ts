import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;
}
