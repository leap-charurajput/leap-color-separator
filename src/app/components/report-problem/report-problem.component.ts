import { Component } from '@angular/core';
import { flareSubmit } from '../../services/flare';
import { LeapSepsLogService } from '../../services/leap-seps-log.service';

@Component({
 selector: 'app-report-problem',
 templateUrl: './report-problem.component.html',
 styleUrls: ['./report-problem.component.css']
})
export class ReportProblemComponent {
 description = '';

 // All three default to UNCHECKED (client-confirmed: "The three checkboxes should default to
 // unchecked"). Checked = the statement is true; an all-unchecked submission is valid.
 //   firstTime    → "First time issue"           (first time the user has seen this)
 //   otherMachine → "Tested on another machine"  (reproduced on another machine)
 //   otherDoc     → "Tested on another document" (reproduced on another document)
 firstTime = false;
 otherMachine = false;
 otherDoc = false;

 submitting = false;
 resultMessage = '';
 resultOk: boolean | null = null;

 constructor(private leapSepsLog: LeapSepsLogService) {}

 get canSubmit(): boolean {
  return !this.submitting && this.description.trim().length > 0;
 }

 async submit(): Promise<void> {
  if (!this.canSubmit) return;
  this.submitting = true;
  this.resultMessage = '';
  this.resultOk = null;

  const description = this.description.trim();
  try {
   this.leapSepsLog.logProcess('Report a problem: submit', {
    firstTime: this.firstTime, otherMachine: this.otherMachine, otherDoc: this.otherDoc
   });

   const r = await flareSubmit(description, undefined, {
    // job / tmpl are attached from the ops trail by the module; passed here when the panel
    // knows them (TODO: wire currentExcelName / currentTemplateUuid once breadcrumbs land).
    job: undefined,
    tmpl: undefined,
    checks: {
     firstTime: this.firstTime,
     otherMachine: this.otherMachine,
     otherDoc: this.otherDoc
    }
   });

   if (r.ok) {
    this.resultOk = true;
    this.resultMessage = 'Report #' + (r.id != null ? r.id : 'sent') + ' sent';
    this.description = '';
    this.firstTime = false;
    this.otherMachine = false;
    this.otherDoc = false;
   } else {
    this.resultOk = false;
    this.resultMessage = 'Submit failed — please try again';
   }
  } catch (e) {
   this.resultOk = false;
   this.resultMessage = 'Submit failed — please try again';
   this.leapSepsLog.logError('ReportProblem', e, 'flareSubmit threw');
  } finally {
   this.submitting = false;
  }
 }

 reset(): void {
  this.description = '';
  this.firstTime = false;
  this.otherMachine = false;
  this.otherDoc = false;
  this.resultMessage = '';
  this.resultOk = null;
 }
}
