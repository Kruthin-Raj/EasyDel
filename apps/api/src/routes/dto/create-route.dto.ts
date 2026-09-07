import { IsString, IsNotEmpty, IsArray, IsOptional } from 'class-validator';

export class CreateRouteDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsNotEmpty()
  locationIds: string[];

  @IsOptional()
  startLocationId?: string;

  @IsOptional()
  endLocationId?: string;
}
