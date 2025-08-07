import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({
  name: 'latestBlock',
})
export class LatestBlockEntity extends BaseEntity {
  @PrimaryGeneratedColumn()
  latestBlockId: number;

  @Column()
  block: number;

  @Column()
  contractAddress: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
