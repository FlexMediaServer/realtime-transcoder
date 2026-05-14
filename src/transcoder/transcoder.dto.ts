import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsNumberString, IsOptional, IsString, Matches } from 'class-validator';

export enum Preset {
	ULTRAFAST = 'ultrafast',
	SUPERFAST = 'superfast',
	VERYFAST = 'veryfast',
	FAST = 'fast',
	SLOW = 'slow',
	SLOWER = 'slower',
	VERYSLOW = 'veryslow',
}

export enum Codec {
	h264 = 'h264',
	hevc = 'hevc',
	passthrough = 'passthrough'
}

export class StartTranscodeDto {
	@IsString()
	@IsOptional()
	session: string;

	@IsOptional()
	@Transform(({ value }) => value === true || value === 'true' || value === '1' || value === 1)
	@IsBoolean()
	directStreamAudio: boolean;

	@IsOptional()
	@Transform(({ value }) => value === true || value === 'true' || value === '1' || value === 1)
	@IsBoolean()
	directStreamVideo: boolean;

	@IsNotEmpty()
	@IsString()
	url: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	offset: number; //Offset defines the starting segment of the transcode session. Eg. you want to start at segment 40

	@IsOptional()
	@Type(() => Boolean)
	@IsBoolean()
	startAtZeroIndex: boolean //Starts HLS/DASH playlist at zero index while allowing offset/seek

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	videoTrack: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	audioTrack: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	subtitleTrack: number;

	@IsOptional()
	@IsString()
	@IsEnum(Codec)
	codec: Codec;

	@IsOptional()
	@IsString()
	@IsEnum(Preset)
	preset: Preset;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	bitrate: number;

	@IsOptional()
	@IsString()
	@Matches(/^-?\d+x-?\d+$/gm)
	resolution: string; //1920x1080 or -1x1080
}
