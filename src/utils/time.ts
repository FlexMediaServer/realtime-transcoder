export function secondsToIsoPt(seconds) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remainingSeconds = seconds % 60;

	let isoTimestamp = "PT";
	if (hours > 0) isoTimestamp += `${hours}H`;
	if (minutes > 0) isoTimestamp += `${minutes}M`;
	if (remainingSeconds > 0 || (hours === 0 && minutes === 0)) {
		isoTimestamp += `${Math.round(remainingSeconds)}S`; // Include seconds if the total is zero
	}

	return isoTimestamp;
}

export function getRealDuration(lastSeekIndex: number, segmentLength: number, currentPosition: string) {
	const pos = currentPosition.split(':'); // split it at the colons
	// minutes are worth 60 seconds. Hours are worth 60 minutes.
	const posSeconds = (+pos[0]) * 60 * 60 + (+pos[1]) * 60 + (+pos[2]);
	return (lastSeekIndex * segmentLength) + posSeconds;
}