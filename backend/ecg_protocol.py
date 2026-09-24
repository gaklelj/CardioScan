"""Transport parsing without hardware or ML dependencies."""
import json
import math


def normalize_sample(sample):
    if isinstance(sample, dict):
        if 'channels' in sample:
            sample = sample['channels']
        elif 'ch1' in sample or 'channel1' in sample:
            sample = [sample.get(f'ch{i}', sample.get(f'channel{i}')) for i in range(1, 4)]
        else:
            sample = [sample.get('value')]
    elif not isinstance(sample, (list, tuple)):
        sample = [sample]
    if not isinstance(sample, (list, tuple)) or len(sample) not in (1, 3, 4):
        raise ValueError('Expected one legacy value, three or four ECG channels')
    values = []
    for value in sample:
        if isinstance(value, bool) or not isinstance(value, (int, float, str)):
            raise ValueError('Invalid ECG value')
        try:
            number = float(value)
        except (ValueError, OverflowError) as exc:
            raise ValueError('Invalid ECG value') from exc
        if not math.isfinite(number):
            raise ValueError('ECG values must be finite')
        values.append(number)
    return values


def parse_sample_line(line):
    line = line.strip()
    if not line:
        raise ValueError('Empty ECG frame')
    if line[0] in '{[':
        return normalize_sample(json.loads(line))
    fields = line.split(',')
    if len(fields) in (6, 7):
        return parse_tcp_frame(line)['channels']
    return normalize_sample(fields)


def parse_tcp_frame(line):
    fields = line.strip().split(',')
    if len(fields) not in (6, 7):
        raise ValueError('Expected timestamp_us,sequence,I,II,III,[V1,]lost_samples')
    try:
        timestamp, sequence, lead1, lead2, lead3, *extra, lost = map(int, fields)
    except ValueError as exc:
        raise ValueError('Invalid TCP ECG frame') from exc
    if timestamp < 0 or not 0 <= sequence <= 0xFFFFFFFF or lost < 0:
        raise ValueError('Invalid ECG metadata')
    if not (0 <= lead1 <= 0xFFFFFF and 0 <= lead2 <= 0xFFFFFF and -0xFFFFFF <= lead3 <= 0xFFFFFF):
        raise ValueError('Invalid raw ECG value')
    if extra and not 0 <= extra[0] <= 0xFFFFFF:
        raise ValueError('Invalid raw V1 value')
    return {'channels': [lead1, lead2, lead3, *extra], 'timestamp_us': timestamp,
            'sequence': sequence, 'lost_samples': lost,
            'lead_labels': ['I', 'II', 'III'] + (['V1'] if extra else []), 'derived_lead': 'III'}


def validate_channels(channels):
    if not isinstance(channels, list) or len(channels) not in (1, 3, 4):
        raise ValueError('Expected one, three or four channel arrays')
    if any(not isinstance(ch, list) or not ch for ch in channels):
        raise ValueError('Channel arrays must not be empty')
    if len({len(ch) for ch in channels}) != 1:
        raise ValueError('Channel arrays must have equal lengths')
    result = []
    for channel in channels:
        values = []
        for value in channel:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError('Channel arrays must contain finite numbers')
            values.append(normalize_sample(value)[0])
        result.append(values)
    return result
