import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EffortLogComponent } from './effort-log.component';

describe('EffortLogComponent', () => {
  let component: EffortLogComponent;
  let fixture: ComponentFixture<EffortLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EffortLogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EffortLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
