import { PartialType, PickType } from '@nestjs/swagger';
import { CreateDirectiveDto } from './create-directive.dto';

/**
 * Title, instructions, and due date only — the recipient is fixed at
 * creation and isn't editable here. A branch-fanned directive has no
 * shared parent row, so this always edits exactly one person's task, never
 * the whole original batch at once.
 */
export class UpdateDirectiveDto extends PartialType(
    PickType(CreateDirectiveDto, ['title', 'body', 'dueDate'] as const),
) { }